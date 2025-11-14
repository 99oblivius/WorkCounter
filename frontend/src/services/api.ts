import axios from 'axios';
import type { Work, WorkGroup, TimeSession, TimelineEntry, User, StatsOverview, FileStorageRecord, PaginatedResponse } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
export { API_URL };

const api = axios.create({
  baseURL: `${API_URL}/api`,
  withCredentials: true,
  // SECURITY: Add CSRF protection header required by backend
  headers: {
    'X-Requested-With': 'XMLHttpRequest'
  },
  // Default timeout: 2 minutes (can be overridden per request)
  timeout: 120000
});

// Global response interceptor for handling authentication errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle 401 Unauthorized - user session expired or account deactivated
    if (error.response?.status === 401) {
      // Check if we're not already on the login page to avoid redirect loop
      if (!window.location.pathname.includes('/login')) {
        // Show error message if account was deactivated
        if (error.response?.data?.error === 'Account deactivated') {
          alert(error.response.data.message || 'Your account has been deactivated. Please contact an administrator.');
        }

        // Redirect to login
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

export const authApi = {
  login: (username: string, password: string) =>
    api.post<{ success: boolean; user: User; forcePasswordReset: boolean }>('/auth/login', {
      username,
      password,
    }),
  logout: () => api.post<{ success: boolean }>('/auth/logout'),
  getMe: () => api.get<User>('/auth/me'),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post<{ success: boolean }>('/auth/change-password', {
      currentPassword,
      newPassword,
    }),
};

export type WorkPermissionLevel = 'viewer' | 'editor' | 'manager';

export interface WorkPermissions {
  permissionLevel: WorkPermissionLevel;
  isOwner: boolean;
  isShared: boolean;
  // Derived permissions
  canView: boolean;
  canCreate: boolean;
  canEditOthers: boolean;
  canDeleteOthers: boolean;
  // Legacy
  canEdit: boolean;
  canDelete: boolean;
}

export const worksApi = {
  getAll: (params?: { status?: string; search?: string }) =>
    api.get<Work[]>('/works', { params }),
  getById: (id: number) => api.get<Work>(`/works/${id}`),
  getPermissions: (id: number) => api.get<WorkPermissions>(`/works/${id}/permissions`),
  create: (data: Partial<Work>) => api.post<Work>('/works', data),
  update: (id: number, data: Partial<Work>) => api.patch<Work>(`/works/${id}`, data),
  delete: (id: number) => api.delete(`/works/${id}`),
};

export const workGroupsApi = {
  getAll: () => api.get<WorkGroup[]>('/work-groups'),
  create: (title: string) => api.post<WorkGroup>('/work-groups', { title }),
  update: (id: number, data: { title?: string; displayOrder?: number }) =>
    api.patch<WorkGroup>(`/work-groups/${id}`, data),
  delete: (id: number) => api.delete(`/work-groups/${id}`),
  reorder: (groupOrders: { id: number; displayOrder: number }[]) =>
    api.post('/work-groups/reorder', { groupOrders }),
};

export const sessionsApi = {
  getRunning: () => api.get<TimeSession | null>('/sessions/running'),
  getAllRunning: () => api.get<TimeSession[]>('/sessions/running/all'),
  getByWorkId: (workId: number) => api.get<TimeSession[]>(`/sessions/work/${workId}`),
  getById: (id: number) => api.get<TimeSession>(`/sessions/${id}`),
  start: (workId: number) => api.post<TimeSession>('/sessions/start', { workId }),
  stop: (id: number) => api.post<TimeSession>(`/sessions/${id}/stop`),
  update: (id: number, data: { startTime?: string; endTime?: string; title?: string | null; color?: string | null }) =>
    api.patch<TimeSession>(`/sessions/${id}`, data),
  delete: (id: number) => api.delete(`/sessions/${id}`),
  getStats: (workId: number) => api.get<{ totalDuration: number }>(`/sessions/work/${workId}/stats`),
};

export const timelineApi = {
  getBySessionId: (sessionId: number) =>
    api.get<TimelineEntry[]>(`/timeline/session/${sessionId}`),
  getByWorkId: (workId: number) =>
    api.get<TimelineEntry[]>(`/timeline/work/${workId}`),
  getById: (id: number) => api.get<TimelineEntry>(`/timeline/${id}`),
  create: (data: { timeSessionId: number; workId: number; timestamp: string; label?: string; activityType?: string; color?: string }) =>
    api.post<TimelineEntry>('/timeline', data),
  update: (id: number, data: { timestamp?: string; label?: string; activityType?: string | null; color?: string | null }) =>
    api.patch<TimelineEntry>(`/timeline/${id}`, data),
  delete: (id: number) => api.delete(`/timeline/${id}`),
  uploadImages: (entryId: number, files: File[], onProgress?: (progress: number) => void) => {
    const formData = new FormData();
    files.forEach(file => formData.append('images', file));

    return api.post<TimelineEntry>(`/timeline/${entryId}/images`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percentCompleted);
        }
      },
    });
  },
  deleteImage: (entryId: number, imageKey: string) =>
    api.delete<TimelineEntry>(`/timeline/${entryId}/images/${imageKey}`),
  getImageUrl: (imageKey: string) => `${API_URL}/api/timeline/images/${imageKey}`,
};

export const statsApi = {
  getOverview: (params?: { startDate?: string; endDate?: string }) =>
    api.get<StatsOverview>('/stats/overview', { params }),
  getToday: () => api.get<{ totalDuration: number; workCount: number }>('/stats/today'),
};

export const filesApi = {
  getByWorkId: (workId: number) =>
    api.get<PaginatedResponse<FileStorageRecord>>(`/files/work/${workId}`),

  getAllByWorkId: (workId: number) =>
    api.get<PaginatedResponse<FileStorageRecord>>(`/files/work/${workId}/all`),

  getById: (fileId: number) =>
    api.get<FileStorageRecord>(`/files/${fileId}`),

  download: (fileId: number, config?: { signal?: AbortSignal; timeout?: number }) =>
    api.get(`/files/${fileId}/download`, {
      responseType: 'blob',
      timeout: config?.timeout || 300000,
      signal: config?.signal,
      onDownloadProgress: () => {
        // Silent progress tracking
      }
    }),

  delete: (fileId: number) =>
    api.delete(`/files/${fileId}`),

  cancel: (fileId: number) =>
    api.post(`/files/${fileId}/cancel`),

  getDownloadUrl: (fileId: number) =>
    `${API_URL}/api/files/${fileId}/download`,

  getTusEndpoint: () =>
    `${API_URL}/api/files/upload`,
};

export const userSettingsApi = {
  getAll: () => api.get<Record<string, string>>('/user-settings'),
  update: (settings: Record<string, string>) => api.patch('/user-settings', settings),
  updateSingle: (key: string, value: string) => api.put(`/user-settings/${key}`, { value }),
  deleteSingle: (key: string) => api.delete(`/user-settings/${key}`),
};

import type { UserWithRoles, Role, SystemSetting, AuditLog, WorkShare } from '../types/admin';

export const adminApi = {
  getUsers: async () => (await api.get<UserWithRoles[]>('/admin/users')).data,
  getUser: async (userId: number) => (await api.get<UserWithRoles>(`/admin/users/${userId}`)).data,
  createUser: async (username: string, email: string) =>
    (await api.post<{ id: number; username: string; email: string; temporaryPassword?: string }>(
      '/admin/users',
      { username, email }
    )).data,
  grantRole: async (userId: number, roleId: number) =>
    (await api.post(`/admin/users/${userId}/roles/${roleId}`, {})).data,
  revokeRole: async (userId: number, roleId: number) =>
    (await api.delete(`/admin/users/${userId}/roles/${roleId}`)).data,
  deactivateUser: async (userId: number) =>
    (await api.patch(`/admin/users/${userId}/deactivate`, {})).data,
  activateUser: async (userId: number) =>
    (await api.patch(`/admin/users/${userId}/activate`, {})).data,
  deleteUser: async (userId: number) =>
    (await api.delete(`/admin/users/${userId}`)).data,
  resetUserPassword: async (userId: number, newPassword: string) =>
    (await api.post(`/admin/users/${userId}/reset-password`, { newPassword })).data,

  getRoles: async () => (await api.get<Role[]>('/admin/roles')).data,
  getPermissions: async () => (await api.get<Record<string, any[]>>('/admin/roles/permissions')).data,

  getSettings: async () => (await api.get<SystemSetting[]>('/admin/settings')).data,
  getSettingsByCategory: async (category: string) =>
    (await api.get<Record<string, any>>(`/admin/settings/category/${category}`)).data,
  updateSetting: async (key: string, value: any) =>
    (await api.patch(`/admin/settings/${key}`, { value })).data,
  getSettingHistory: async (settingId: number) =>
    (await api.get<any[]>(`/admin/settings/${settingId}/history`)).data,

  getAuditLogs: async (filters?: {
    userId?: number;
    action?: string;
    resourceType?: string;
    status?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }) => {
    const params = new URLSearchParams();
    if (filters?.userId) params.append('userId', filters.userId.toString());
    if (filters?.action) params.append('action', filters.action);
    if (filters?.resourceType) params.append('resourceType', filters.resourceType);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.startDate) params.append('startDate', filters.startDate.toISOString());
    if (filters?.endDate) params.append('endDate', filters.endDate.toISOString());
    if (filters?.limit) params.append('limit', filters.limit.toString());
    if (filters?.offset) params.append('offset', filters.offset.toString());

    return (await api.get<AuditLog[]>(`/admin/audit?${params.toString()}`)).data;
  },
  getAuditStats: async (days: number = 30) =>
    (await api.get<any[]>(`/admin/audit/stats?days=${days}`)).data,
  getUserActivity: async (userId: number, limit: number = 20) =>
    (await api.get<any[]>(`/admin/audit/user/${userId}?limit=${limit}`)).data,
};

export const workSharingApi = {
  getWorkShares: async (workId: number) =>
    (await api.get<{ shares: WorkShare[] }>(`/work-sharing/${workId}/shares`)).data,
  shareWork: async (workId: number, usernameOrEmail: string, permissionLevel: 'viewer' | 'editor' | 'manager' = 'viewer') =>
    (await api.post(`/work-sharing/${workId}/share`, { usernameOrEmail, permissionLevel })).data,
  unshareWork: async (workId: number, identifier: string) =>
    (await api.delete(`/work-sharing/${workId}/share/${encodeURIComponent(identifier)}`)).data,
  leaveSharedWork: async (workId: number) =>
    (await api.post(`/work-sharing/${workId}/leave`, {})).data,
  getSharedWithMe: async () =>
    (await api.get<any[]>('/work-sharing/shared-with-me')).data,
};

export const settingsApi = {
  getPublicSettings: async () =>
    (await api.get<Record<string, any>>('/settings/public')).data,
};

export const streamApi = {
  updateContext: (workId: number | null, connectionId: string) =>
    api.put('/stream/context', { workId, connectionId }),
};
