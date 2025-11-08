import { Response } from 'express';
import { createClient, RedisClientType } from 'redis';
import { env } from '../config/env.js';

/**
 * SSE Service - Real-time updates for work pages
 *
 * Architecture:
 * - Single SSE connection per work page per client
 * - Initial snapshot of all work data sent immediately
 * - Incremental updates via Redis pub/sub
 * - Replaces polling with event-driven updates
 *
 * Event Types:
 * - work:update - Work metadata changed
 * - session:start - Timer started
 * - session:stop - Timer stopped
 * - session:update - Session modified
 * - session:delete - Session deleted
 * - timeline:create - New timeline entry
 * - timeline:update - Timeline entry modified
 * - timeline:delete - Timeline entry deleted
 * - file:upload - File uploaded
 * - file:delete - File deleted
 * - share:add - Work shared with someone
 * - share:remove - Share removed
 */

interface SSEConnection {
  workId: number;
  userId: number;
  res: Response;
  keepAliveTimer: NodeJS.Timeout;
}

interface UserSSEConnection {
  userId: number;
  res: Response;
  keepAliveTimer: NodeJS.Timeout;
}

class SSEService {
  private connections: Map<string, SSEConnection> = new Map();
  private userConnections: Map<string, UserSSEConnection> = new Map();
  private pubClient: RedisClientType | null = null;
  private subClient: RedisClientType | null = null;
  private isInitialized = false;
  private connectionCounter = 0;
  private userConnectionCounter = 0;

  /**
   * Initialize Redis pub/sub clients
   * Separate from session client to avoid blocking operations
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

      this.pubClient.on('error', (err) => console.error('[SSE] Pub client error:', err));
      this.subClient.on('error', (err) => console.error('[SSE] Sub client error:', err));

      await this.pubClient.connect();
      await this.subClient.connect();

      console.log('[SSE] Redis pub/sub clients connected');
      this.isInitialized = true;
    } catch (error) {
      console.error('[SSE] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Create unique connection ID for each connection
   * Allows same user to have multiple tabs open to the same work
   */
  private getConnectionId(userId: number, workId: number): string {
    return `${userId}:${workId}:${++this.connectionCounter}:${Date.now()}`;
  }

  /**
   * Get Redis channel name for a work
   */
  private getWorkChannel(workId: number): string {
    return `work:${workId}:updates`;
  }

  /**
   * Get Redis channel name for a user
   */
  private getUserChannel(userId: number): string {
    return `user:${userId}:updates`;
  }

  /**
   * Create unique connection ID for user-level connections
   */
  private getUserConnectionId(userId: number): string {
    return `user:${userId}:${++this.userConnectionCounter}:${Date.now()}`;
  }

  /**
   * Setup SSE connection for a work page
   * Sends initial data snapshot and subscribes to updates
   */
  async setupConnection(
    workId: number,
    userId: number,
    res: Response,
    initialData: any
  ): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('SSE Service not initialized');
    }

    const connectionId = this.getConnectionId(userId, workId);
    const channel = this.getWorkChannel(workId);

    // Setup SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Send initial snapshot
    this.sendEvent(res, 'snapshot', initialData);

    // Keep-alive ping every 30s to prevent connection timeout
    const keepAliveTimer = setInterval(() => {
      res.write(': ping\n\n');
    }, 30000);

    // Store connection
    this.connections.set(connectionId, {
      workId,
      userId,
      res,
      keepAliveTimer,
    });

    console.log(`[SSE] Connection established: user ${userId}, work ${workId}`);

    // Subscribe to work updates (if not already subscribed)
    // Note: Redis pub/sub is shared across all connections to the same work
    const subscriberCount = Array.from(this.connections.values())
      .filter(conn => conn.workId === workId).length;

    if (subscriberCount === 1) {
      // First connection to this work - subscribe to channel
      await this.subClient!.subscribe(channel, (message) => {
        this.handleMessage(workId, message);
      });
      console.log(`[SSE] Subscribed to channel: ${channel}`);
    }

    // Cleanup on disconnect
    res.on('close', () => {
      this.closeConnection(connectionId, workId);
    });
  }

  /**
   * Handle incoming Redis pub/sub message
   */
  private handleMessage(workId: number, message: string): void {
    try {
      const data = JSON.parse(message);

      // Broadcast to all connections for this work
      for (const [connectionId, conn] of this.connections.entries()) {
        if (conn.workId === workId) {
          this.sendEvent(conn.res, data.type, data.payload);
        }
      }
    } catch (error) {
      console.error('[SSE] Failed to handle message:', error);
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
      console.error('[SSE] Failed to send event:', error);
    }
  }

  /**
   * Close SSE connection
   */
  private async closeConnection(connectionId: string, workId: number): Promise<void> {
    const conn = this.connections.get(connectionId);
    if (!conn) return;

    // Clear keep-alive timer
    clearInterval(conn.keepAliveTimer);

    // Remove connection
    this.connections.delete(connectionId);
    console.log(`[SSE] Connection closed: ${connectionId}`);

    // Check if this was the last connection to this work
    const remainingConnections = Array.from(this.connections.values())
      .filter(c => c.workId === workId).length;

    if (remainingConnections === 0) {
      // Last connection - unsubscribe from channel
      const channel = this.getWorkChannel(workId);
      await this.subClient!.unsubscribe(channel);
      console.log(`[SSE] Unsubscribed from channel: ${channel}`);
    }
  }

  /**
   * Emit update event for a work
   * Called by route handlers when data changes
   */
  async emitWorkUpdate(workId: number, type: string, payload: any): Promise<void> {
    if (!this.isInitialized || !this.pubClient) return;

    const channel = this.getWorkChannel(workId);
    const message = JSON.stringify({ type, payload });

    try {
      await this.pubClient.publish(channel, message);
      console.log(`[SSE] Emitted ${type} for work ${workId}`);
    } catch (error) {
      console.error('[SSE] Failed to emit event:', error);
    }
  }

  /**
   * Setup SSE connection for user-level updates (dashboard)
   * Sends initial data snapshot and subscribes to updates
   */
  async setupUserConnection(
    userId: number,
    res: Response,
    initialData: any
  ): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('SSE Service not initialized');
    }

    const connectionId = this.getUserConnectionId(userId);
    const channel = this.getUserChannel(userId);

    // Setup SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Send initial snapshot
    this.sendEvent(res, 'snapshot', initialData);

    // Keep-alive ping every 30s to prevent connection timeout
    const keepAliveTimer = setInterval(() => {
      res.write(': ping\n\n');
    }, 30000);

    // Store connection
    this.userConnections.set(connectionId, {
      userId,
      res,
      keepAliveTimer,
    });

    console.log(`[User SSE] Connection established: user ${userId}`);

    // Subscribe to user updates (if not already subscribed)
    const subscriberCount = Array.from(this.userConnections.values())
      .filter(conn => conn.userId === userId).length;

    if (subscriberCount === 1) {
      // First connection for this user - subscribe to channel
      await this.subClient!.subscribe(channel, (message) => {
        this.handleUserMessage(userId, message);
      });
      console.log(`[User SSE] Subscribed to channel: ${channel}`);
    }

    // Cleanup on disconnect
    res.on('close', () => {
      this.closeUserConnection(connectionId, userId);
    });
  }

  /**
   * Handle incoming Redis pub/sub message for user
   */
  private handleUserMessage(userId: number, message: string): void {
    try {
      const data = JSON.parse(message);

      // Broadcast to all connections for this user
      for (const [connectionId, conn] of this.userConnections.entries()) {
        if (conn.userId === userId) {
          this.sendEvent(conn.res, data.type, data.payload);
        }
      }
    } catch (error) {
      console.error('[User SSE] Failed to handle message:', error);
    }
  }

  /**
   * Close user SSE connection
   */
  private async closeUserConnection(connectionId: string, userId: number): Promise<void> {
    const conn = this.userConnections.get(connectionId);
    if (!conn) return;

    // Clear keep-alive timer
    clearInterval(conn.keepAliveTimer);

    // Remove connection
    this.userConnections.delete(connectionId);
    console.log(`[User SSE] Connection closed: ${connectionId}`);

    // Check if this was the last connection for this user
    const remainingConnections = Array.from(this.userConnections.values())
      .filter(c => c.userId === userId).length;

    if (remainingConnections === 0) {
      // Last connection - unsubscribe from channel
      const channel = this.getUserChannel(userId);
      await this.subClient!.unsubscribe(channel);
      console.log(`[User SSE] Unsubscribed from channel: ${channel}`);
    }
  }

  /**
   * Emit update event for a user
   * Called when works are shared/unshared or sessions change
   */
  async emitUserUpdate(userId: number, type: string, payload: any): Promise<void> {
    if (!this.isInitialized || !this.pubClient) return;

    const channel = this.getUserChannel(userId);
    const message = JSON.stringify({ type, payload });

    try {
      await this.pubClient.publish(channel, message);
      console.log(`[User SSE] Emitted ${type} for user ${userId}`);
    } catch (error) {
      console.error('[User SSE] Failed to emit event:', error);
    }
  }

  /**
   * Get connection count (for monitoring)
   */
  getConnectionCount(): number {
    return this.connections.size + this.userConnections.size;
  }

  /**
   * Cleanup on shutdown
   */
  async shutdown(): Promise<void> {
    console.log('[SSE] Shutting down...');

    // Close all work connections
    for (const [connectionId, conn] of this.connections.entries()) {
      clearInterval(conn.keepAliveTimer);
      conn.res.end();
    }
    this.connections.clear();

    // Close all user connections
    for (const [connectionId, conn] of this.userConnections.entries()) {
      clearInterval(conn.keepAliveTimer);
      conn.res.end();
    }
    this.userConnections.clear();

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
export const sseService = new SSEService();
