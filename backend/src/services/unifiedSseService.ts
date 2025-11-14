import { Response } from 'express';
import { createClient, RedisClientType } from 'redis';
import { env } from '../config/env.js';

/**
 * Unified SSE Service - Single connection per client with dynamic context switching
 *
 * Architecture:
 * - ONE SSE connection per client (browser SSE limit friendly)
 * - Dynamic subscription management based on user context (dashboard vs work page)
 * - Initial snapshot includes user permissions, works, and sessions
 * - Context updates via PUT /api/stream/context trigger channel subscription changes
 * - All events (user-level + work-level) flow through single connection
 *
 * Event Types:
 * - User-level: work:create/update/delete, work:shared/unshared, permissions:updated, account:deactivated
 * - Work-level: session:start/stop/update/delete, timeline:create/update/delete, file:upload/delete, share:add/remove
 */

interface StreamConnection {
  userId: number;
  res: Response;
  keepAliveTimer: NodeJS.Timeout;
  currentWorkId: number | null; // Track which work context user is viewing
  subscribedChannels: Set<string>; // Track all Redis channels this connection is subscribed to
  connectionId: string;
}

class UnifiedSSEService {
  // FIXED: Support multiple connections per user (multiple tabs/browsers)
  private connections: Map<number, Map<string, StreamConnection>> = new Map(); // userId -> Map<connectionId, connection>
  private channelSubscribers: Map<string, Set<string>> = new Map(); // channel -> Set<connectionKey> where connectionKey = "userId:connectionId"
  private subClient: RedisClientType | null = null;
  private pubClient: RedisClientType | null = null;
  private isInitialized = false;

  /**
   * Initialize Redis pub/sub clients
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Publisher client (for emitting events)
      this.pubClient = createClient({
        socket: {
          host: env.REDIS_HOST || 'redis',
          port: env.REDIS_PORT || 6379,
        },
      });

      // Subscriber client (for SSE connections)
      this.subClient = createClient({
        socket: {
          host: env.REDIS_HOST || 'redis',
          port: env.REDIS_PORT || 6379,
        },
      });

      this.pubClient.on('error', (err) => console.error('[Unified SSE] Pub client error:', err));
      this.subClient.on('error', (err) => console.error('[Unified SSE] Sub client error:', err));

      await this.pubClient.connect();
      await this.subClient.connect();

      this.isInitialized = true;
    } catch (error) {
      console.error('[Unified SSE] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Get Redis channel name for a user
   */
  private getUserChannel(userId: number): string {
    return `user:${userId}:updates`;
  }

  /**
   * Get Redis channel name for a work
   */
  private getWorkChannel(workId: number): string {
    return `work:${workId}:updates`;
  }

  /**
   * Setup unified SSE connection for a user
   * FIXED: Now supports multiple concurrent connections per user (multiple tabs/browsers)
   * Each connection has its own context (workId) for independent navigation
   */
  async setupConnection(
    userId: number,
    clientConnectionId: string, // Client-provided connection ID
    res: Response,
    initialSnapshot: any
  ): Promise<void> {
    if (!this.isInitialized || !this.subClient) {
      throw new Error('SSE Service not initialized');
    }

    // Get or create connections map for this user
    if (!this.connections.has(userId)) {
      this.connections.set(userId, new Map());
    }
    const userConnections = this.connections.get(userId)!;

    // Check for duplicate connection ID
    if (userConnections.has(clientConnectionId)) {
      console.warn(`[Unified SSE] Connection ${clientConnectionId} already exists for user ${userId}, closing old one`);
      await this.closeConnection(userId, clientConnectionId);
    }

    // Setup SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Send initial snapshot with all user data
    this.sendEvent(res, 'snapshot', initialSnapshot);

    // Keep-alive ping every 30s
    const keepAliveTimer = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch (error) {
        console.error(`[Unified SSE] Keep-alive failed for user ${userId}, connection ${clientConnectionId}:`, error);
        this.closeConnection(userId, clientConnectionId);
      }
    }, 30000);

    // Create connection object
    const connection: StreamConnection = {
      userId,
      res,
      keepAliveTimer,
      currentWorkId: null,
      subscribedChannels: new Set(),
      connectionId: clientConnectionId,
    };

    // Store connection
    userConnections.set(clientConnectionId, connection);

    // Subscribe to user-level channel (always active)
    const userChannel = this.getUserChannel(userId);
    await this.subscribeToChannel(userId, clientConnectionId, userChannel);

    // Cleanup on disconnect
    res.on('close', () => {
      this.closeConnection(userId, clientConnectionId);
    });
  }

  /**
   * Update specific connection's work context (called when navigating between dashboard and work pages)
   * FIXED: Updates ONLY the specific connection, not all user connections (multi-tab support)
   */
  async updateContext(userId: number, connectionId: string, workId: number | null): Promise<void> {
    const userConnections = this.connections.get(userId);
    if (!userConnections || userConnections.size === 0) {
      console.warn(`[Unified SSE] No connections found for user ${userId}`);
      return;
    }

    const connection = userConnections.get(connectionId);
    if (!connection) {
      console.warn(`[Unified SSE] Connection ${connectionId} not found for user ${userId}`);
      return;
    }

    const previousWorkId = connection.currentWorkId;

    // No change
    if (previousWorkId === workId) {
      return;
    }

    // Unsubscribe from previous work channel (only for this connection)
    if (previousWorkId !== null) {
      const oldChannel = this.getWorkChannel(previousWorkId);
      await this.unsubscribeFromChannel(userId, connectionId, oldChannel);
    }

    // Subscribe to new work channel (only for this connection)
    if (workId !== null) {
      const newChannel = this.getWorkChannel(workId);
      await this.subscribeToChannel(userId, connectionId, newChannel);
    }

    // Update context for THIS specific connection only
    connection.currentWorkId = workId;
  }

  /**
   * Subscribe specific connection to a Redis channel
   * FIXED: Tracks channel per-connection for independent multi-tab navigation
   */
  private async subscribeToChannel(userId: number, connectionId: string, channel: string): Promise<void> {
    if (!this.subClient) return;

    const userConnections = this.connections.get(userId);
    if (!userConnections) return;

    const connection = userConnections.get(connectionId);
    if (!connection) return;

    // Track this connection as a subscriber
    if (!this.channelSubscribers.has(channel)) {
      this.channelSubscribers.set(channel, new Set());
    }

    // Create a unique identifier for this specific connection
    const connectionKey = `${userId}:${connectionId}`;
    this.channelSubscribers.get(channel)!.add(connectionKey);

    // Subscribe to Redis channel if first subscriber
    if (this.channelSubscribers.get(channel)!.size === 1) {
      await this.subClient.subscribe(channel, (message) => {
        this.handleMessage(channel, message);
      });
    }

    // Track channel in THIS specific connection
    connection.subscribedChannels.add(channel);
  }

  /**
   * Unsubscribe specific connection from a Redis channel
   * FIXED: Removes channel from specific connection only
   */
  private async unsubscribeFromChannel(userId: number, connectionId: string, channel: string): Promise<void> {
    if (!this.subClient) return;

    const userConnections = this.connections.get(userId);
    if (!userConnections) return;

    const connection = userConnections.get(connectionId);
    if (!connection) return;

    // Remove this connection from channel subscribers
    const connectionKey = `${userId}:${connectionId}`;
    const subscribers = this.channelSubscribers.get(channel);
    if (subscribers) {
      subscribers.delete(connectionKey);

      // Unsubscribe from Redis channel if no more subscribers
      if (subscribers.size === 0) {
        await this.subClient.unsubscribe(channel);
        this.channelSubscribers.delete(channel);
      }
    }

    // Remove channel from THIS specific connection
    connection.subscribedChannels.delete(channel);
  }

  /**
   * Handle incoming Redis pub/sub message
   * FIXED: Broadcasts to ONLY connections subscribed to this specific channel
   */
  private handleMessage(channel: string, message: string): void {
    try {
      const data = JSON.parse(message);
      const subscribers = this.channelSubscribers.get(channel);

      if (!subscribers || subscribers.size === 0) {
        return;
      }

      // Broadcast to each subscribed connection
      for (const connectionKey of subscribers) {
        const [userIdStr, connectionId] = connectionKey.split(':');
        const userId = parseInt(userIdStr, 10);

        const userConnections = this.connections.get(userId);
        if (userConnections) {
          const connection = userConnections.get(connectionId);
          if (connection) {
            // Only send to connections that are subscribed to this channel
            if (connection.subscribedChannels.has(channel)) {
              this.sendEvent(connection.res, data.type, data.payload);
            }
          }
        }
      }
    } catch (error) {
      console.error(`[Unified SSE] Failed to handle message on ${channel}:`, error);
    }
  }

  /**
   * Send SSE event to client
   */
  private sendEvent(res: Response, event: string, data: any): void {
    try {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (error) {
      console.error(`[Unified SSE] Failed to send event:`, error);
    }
  }

  /**
   * Close SSE connection
   * FIXED: Closes specific connection and cleans up its channel subscriptions
   */
  private async closeConnection(userId: number, connectionId: string): Promise<void> {
    const userConnections = this.connections.get(userId);
    if (!userConnections) return;

    const connection = userConnections.get(connectionId);
    if (!connection) return;

    // Clear keep-alive timer
    clearInterval(connection.keepAliveTimer);

    // Unsubscribe this specific connection from all its channels
    for (const channel of connection.subscribedChannels) {
      await this.unsubscribeFromChannel(userId, connectionId, channel);
    }

    // Remove this specific connection
    userConnections.delete(connectionId);

    // If no more connections for this user, remove user's connection map
    if (userConnections.size === 0) {
      this.connections.delete(userId);
    }

    // Close response
    try {
      connection.res.end();
    } catch (error) {
      // Connection already closed
    }
  }

  /**
   * Emit event to user's stream (all connections)
   */
  async emitToUser(userId: number, type: string, payload: any): Promise<void> {
    if (!this.isInitialized || !this.pubClient) return;

    const channel = this.getUserChannel(userId);
    const message = JSON.stringify({ type, payload });

    try {
      await this.pubClient.publish(channel, message);
    } catch (error) {
      console.error(`[Unified SSE] Failed to emit to user ${userId}:`, error);
    }
  }

  /**
   * Emit event to specific connection only (for connection-specific data like work snapshots)
   */
  async emitToConnection(userId: number, connectionId: string, type: string, payload: any): Promise<void> {
    const userConnections = this.connections.get(userId);
    if (!userConnections) {
      console.warn(`[Unified SSE] No connections found for user ${userId}`);
      return;
    }

    const connection = userConnections.get(connectionId);
    if (!connection) {
      console.warn(`[Unified SSE] Connection ${connectionId} not found for user ${userId}`);
      return;
    }

    this.sendEvent(connection.res, type, payload);
  }

  /**
   * Emit event to work's stream (all users viewing this work)
   */
  async emitToWork(workId: number, type: string, payload: any): Promise<void> {
    if (!this.isInitialized || !this.pubClient) return;

    const channel = this.getWorkChannel(workId);
    const message = JSON.stringify({ type, payload });

    try {
      await this.pubClient.publish(channel, message);
    } catch (error) {
      console.error(`[Unified SSE] Failed to emit to work ${workId}:`, error);
    }
  }

  /**
   * Get total connection count (for monitoring)
   * FIXED: Counts all connections, not just unique users
   */
  getConnectionCount(): number {
    let total = 0;
    for (const userConnections of this.connections.values()) {
      total += userConnections.size;
    }
    return total;
  }

  /**
   * Check if user has active SSE connection
   */
  hasUserConnection(userId: number): boolean {
    return this.connections.has(userId);
  }

  /**
   * Get user's current work context
   * FIXED: Gets context from any user connection (they should all be the same)
   */
  getUserContext(userId: number): number | null {
    const userConnections = this.connections.get(userId);
    if (!userConnections || userConnections.size === 0) return null;

    // Get context from first connection (all connections share same context)
    const firstConnection = Array.from(userConnections.values())[0];
    return firstConnection.currentWorkId;
  }

  /**
   * Cleanup on shutdown
   * FIXED: Closes all connections for all users
   */
  async shutdown(): Promise<void> {
    // Close all connections for all users
    for (const [userId, userConnections] of this.connections.entries()) {
      for (const connectionId of userConnections.keys()) {
        await this.closeConnection(userId, connectionId);
      }
    }

    // Disconnect Redis clients
    if (this.pubClient) {
      await this.pubClient.quit();
    }
    if (this.subClient) {
      await this.subClient.quit();
    }

    this.isInitialized = false;
  }
}

// Singleton instance
export const unifiedSseService = new UnifiedSSEService();
