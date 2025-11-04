import axios from 'axios';
import type { Work, TimeSession, TimelineEntry, User, StatsOverview, FileStorageRecord } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
export { API_URL };

const api = axios.create({
  baseURL: `${API_URL}/api`,
  withCredentials: true,
});

export const authApi = {
  getLoginUrl: () => api.get<{ authUrl: string }>('/auth/login'),
  logout: () => api.post('/auth/logout'),
  getMe: () => api.get<User>('/auth/me'),
};

export const worksApi = {
  getAll: (params?: { status?: string; search?: string }) =>
    api.get<Work[]>('/works', { params }),
  getById: (id: number) => api.get<Work>(`/works/${id}`),
  create: (data: Partial<Work>) => api.post<Work>('/works', data),
  update: (id: number, data: Partial<Work>) => api.patch<Work>(`/works/${id}`, data),
  delete: (id: number) => api.delete(`/works/${id}`),
};

export const sessionsApi = {
  getRunning: () => api.get<TimeSession | null>('/sessions/running'),
  getByWorkId: (workId: number) => api.get<TimeSession[]>(`/sessions/work/${workId}`),
  getById: (id: number) => api.get<TimeSession>(`/sessions/${id}`),
  start: (workId: number) => api.post<TimeSession>('/sessions/start', { workId }),
  stop: (id: number) => api.post<TimeSession>(`/sessions/${id}/stop`),
  update: (id: number, data: { startTime?: string; endTime?: string }) =>
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
  create: (data: { timeSessionId: number; workId: number; timestamp: string; label?: string; activityType?: string }) =>
    api.post<TimelineEntry>('/timeline', data),
  update: (id: number, data: { timestamp?: string; label?: string; activityType?: string | null }) =>
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
