import axios from 'axios';
import type { UserWithRoles, Role, SystemSetting, AuditLog, WorkShare } from '../types/admin';

const API_URL = import.meta.env.VITE_API_URL || window.location.origin;

// SECURITY: Configure axios with CSRF protection header
const axiosConfig = {
  withCredentials: true,
  headers: {
    'X-Requested-With': 'XMLHttpRequest'
  }
};

export const adminApi = {
  // Users
  async getUsers(): Promise<UserWithRoles[]> {
    const response = await axios.get(`${API_URL}/api/admin/users`, axiosConfig);
    return response.data;
  },

  async getUser(userId: number): Promise<UserWithRoles> {
    const response = await axios.get(`${API_URL}/api/admin/users/${userId}`, axiosConfig);
    return response.data;
  },

  async createUser(username: string, email: string): Promise<{ id: number; username: string; email: string; temporaryPassword?: string }> {
    const response = await axios.post(
      `${API_URL}/api/admin/users`,
      { username, email },
      axiosConfig
    );
    return response.data;
  },

  async grantRole(userId: number, roleId: number): Promise<void> {
    await axios.post(
      `${API_URL}/api/admin/users/${userId}/roles/${roleId}`,
      {},
      axiosConfig
    );
  },

  async revokeRole(userId: number, roleId: number): Promise<void> {
    await axios.delete(
      `${API_URL}/api/admin/users/${userId}/roles/${roleId}`,
      axiosConfig
    );
  },

  async deactivateUser(userId: number): Promise<void> {
    await axios.patch(
      `${API_URL}/api/admin/users/${userId}/deactivate`,
      {},
      axiosConfig
    );
  },

  async activateUser(userId: number): Promise<void> {
    await axios.patch(
      `${API_URL}/api/admin/users/${userId}/activate`,
      {},
      axiosConfig
    );
  },

  async deleteUser(userId: number): Promise<void> {
    await axios.delete(
      `${API_URL}/api/admin/users/${userId}`,
      axiosConfig
    );
  },

  async resetUserPassword(userId: number, newPassword: string): Promise<void> {
    await axios.post(
      `${API_URL}/api/admin/users/${userId}/reset-password`,
      { newPassword },
      axiosConfig
    );
  },

  // Roles
  async getRoles(): Promise<Role[]> {
    const response = await axios.get(`${API_URL}/api/admin/roles`, axiosConfig);
    return response.data;
  },

  async getPermissions(): Promise<Record<string, any[]>> {
    const response = await axios.get(`${API_URL}/api/admin/roles/permissions`, axiosConfig);
    return response.data;
  },

  // Settings
  async getSettings(): Promise<SystemSetting[]> {
    const response = await axios.get(`${API_URL}/api/admin/settings`, axiosConfig);
    return response.data;
  },

  async getSettingsByCategory(category: string): Promise<Record<string, any>> {
    const response = await axios.get(
      `${API_URL}/api/admin/settings/category/${category}`,
      axiosConfig
    );
    return response.data;
  },

  async updateSetting(key: string, value: any): Promise<void> {
    await axios.patch(
      `${API_URL}/api/admin/settings/${key}`,
      { value },
      axiosConfig
    );
  },

  async getSettingHistory(settingId: number): Promise<any[]> {
    const response = await axios.get(
      `${API_URL}/api/admin/settings/${settingId}/history`,
      axiosConfig
    );
    return response.data;
  },

  // Audit Logs
  async getAuditLogs(filters?: {
    userId?: number;
    action?: string;
    resourceType?: string;
    status?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<AuditLog[]> {
    const params = new URLSearchParams();
    if (filters?.userId) params.append('userId', filters.userId.toString());
    if (filters?.action) params.append('action', filters.action);
    if (filters?.resourceType) params.append('resourceType', filters.resourceType);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.startDate) params.append('startDate', filters.startDate.toISOString());
    if (filters?.endDate) params.append('endDate', filters.endDate.toISOString());
    if (filters?.limit) params.append('limit', filters.limit.toString());
    if (filters?.offset) params.append('offset', filters.offset.toString());

    const response = await axios.get(
      `${API_URL}/api/admin/audit?${params.toString()}`,
      axiosConfig
    );
    return response.data;
  },

  async getAuditStats(days: number = 30): Promise<any[]> {
    const response = await axios.get(
      `${API_URL}/api/admin/audit/stats?days=${days}`,
      axiosConfig
    );
    return response.data;
  },

  async getUserActivity(userId: number, limit: number = 20): Promise<any[]> {
    const response = await axios.get(
      `${API_URL}/api/admin/audit/user/${userId}?limit=${limit}`,
      axiosConfig
    );
    return response.data;
  },
};

export const workSharingApi = {
  async getWorkShares(workId: number): Promise<{ shares: WorkShare[] }> {
    const response = await axios.get(
      `${API_URL}/api/work-sharing/${workId}/shares`,
      axiosConfig
    );
    return response.data;
  },

  async shareWork(workId: number, usernameOrEmail: string, permissionLevel: 'viewer' | 'editor' | 'manager' = 'viewer'): Promise<void> {
    await axios.post(
      `${API_URL}/api/work-sharing/${workId}/share`,
      { usernameOrEmail, permissionLevel },
      axiosConfig
    );
  },

  async unshareWork(workId: number, identifier: string): Promise<void> {
    await axios.delete(
      `${API_URL}/api/work-sharing/${workId}/share/${encodeURIComponent(identifier)}`,
      axiosConfig
    );
  },

  async leaveSharedWork(workId: number): Promise<void> {
    await axios.post(
      `${API_URL}/api/work-sharing/${workId}/leave`,
      {},
      axiosConfig
    );
  },

  async getSharedWithMe(): Promise<any[]> {
    const response = await axios.get(
      `${API_URL}/api/work-sharing/shared-with-me`,
      axiosConfig
    );
    return response.data;
  },
};

export const settingsApi = {
  async getPublicSettings(): Promise<Record<string, any>> {
    // Public settings don't need CSRF protection as they're GET-only and public
    const response = await axios.get(`${API_URL}/api/settings/public`);
    return response.data;
  },
};
