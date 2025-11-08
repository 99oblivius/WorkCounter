import axios from 'axios';
import type { Work, WorkGroup, TimeSession, TimelineEntry, User, StatsOverview, FileStorageRecord } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
export { API_URL };

const api = axios.create({
  baseURL: `${API_URL}/api`,
  withCredentials: true,
  // SECURITY: Add CSRF protection header required by backend
  headers: {
    'X-Requested-With': 'XMLHttpRequest'
  }
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
  // FIX BUG 3: Get all running sessions across accessible works (for dashboard)
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
  // Get all completed files for a work
  getByWorkId: (workId: number) =>
    api.get<FileStorageRecord[]>(`/files/work/${workId}`),

  // Get all files including in-progress (for inline progress UI)
  getAllByWorkId: (workId: number) =>
    api.get<FileStorageRecord[]>(`/files/work/${workId}/all`),

  // Get single file metadata
  getById: (fileId: number) =>
    api.get<FileStorageRecord>(`/files/${fileId}`),

  // Download file
  download: (fileId: number) =>
    api.get(`/files/${fileId}/download`, { responseType: 'blob' }),

  // Delete file
  delete: (fileId: number) =>
    api.delete(`/files/${fileId}`),

  // Cancel upload
  cancel: (fileId: number) =>
    api.post(`/files/${fileId}/cancel`),

  // Get download URL
  getDownloadUrl: (fileId: number) =>
    `${API_URL}/api/files/${fileId}/download`,

  // Get tus upload endpoint
  getTusEndpoint: () =>
    `${API_URL}/api/files/upload`,
};

export const userSettingsApi = {
  getAll: () => api.get<Record<string, string>>('/user-settings'),
  update: (settings: Record<string, string>) => api.patch('/user-settings', settings),
  updateSingle: (key: string, value: string) => api.put(`/user-settings/${key}`, { value }),
  deleteSingle: (key: string) => api.delete(`/user-settings/${key}`),
};
