import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import type { UserPermissions } from '../types/permissions';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * Hook to fetch and cache the current user's global permissions and limits
 * This provides all RBAC permissions and file size limits for the UI
 *
 * @returns User permissions, limits, loading state, and error
 */
export function useUserPermissions() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['user-permissions'],
    queryFn: async () => {
      const response = await axios.get<UserPermissions>(
        `${API_URL}/api/user-permissions/me`,
        {
          withCredentials: true,
          headers: {
            'X-Requested-With': 'XMLHttpRequest',
          },
        }
      );
      return response.data;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
    retryOnMount: false,
  });

  const permissions: UserPermissions['permissions'] = data?.permissions || {
    admin: {
      access: false,
      viewUsers: false,
      editUsers: false,
      manageRoles: false,
      deactivateUsers: false,
      viewSettings: false,
      editSettings: false,
      viewAuditLogs: false,
    },
    files: {
      upload: false,
      bypassSizeLimits: false,
      deleteOwn: false,
      viewAll: false,
    },
    attachments: {
      upload: false,
      deleteOwn: false,
    },
    works: {
      create: false,
      viewOwn: false,
      editOwn: false,
      deleteOwn: false,
      share: false,
      viewShared: false,
    },
    sessions: {
      create: false,
      editOwn: false,
      deleteOwn: false,
    },
    timeline: {
      create: false,
      editOwn: false,
      deleteOwn: false,
    },
  };

  const limits: UserPermissions['limits'] = data?.limits || {
    maxFileSize: 5368709120,
    maxImageSize: 52428800,
    maxNoteImages: 9,
    maxFileSizeFormatted: '5 GB',
    maxImageSizeFormatted: '50 MB',
  };

  return {
    permissions,
    limits,
    isLoading,
    error,
    refetch,

    can: {
      uploadFiles: permissions.files.upload,
      bypassFileSizeLimits: permissions.files.bypassSizeLimits,
      deleteOwnFiles: permissions.files.deleteOwn,

      uploadAttachments: permissions.attachments.upload,
      deleteOwnAttachments: permissions.attachments.deleteOwn,

      createWorks: permissions.works.create,
      shareWorks: permissions.works.share,

      createTimeline: permissions.timeline.create,
      editOwnTimeline: permissions.timeline.editOwn,
      deleteOwnTimeline: permissions.timeline.deleteOwn,

      createSessions: permissions.sessions.create,
      editOwnSessions: permissions.sessions.editOwn,
      deleteOwnSessions: permissions.sessions.deleteOwn,

      accessAdmin: permissions.admin.access,
    },
  };
}
