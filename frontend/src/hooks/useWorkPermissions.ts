import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { worksApi, WorkPermissions } from '../services/api';
import { useAuth } from './useAuth';

export function useWorkPermissions(workId: number | undefined) {
  const { user } = useAuth();

  const { data, isLoading, error } = useQuery({
    queryKey: ['work-permissions', workId],
    queryFn: async () => {
      if (!workId) return null;
      const response = await worksApi.getPermissions(workId);
      return response.data;
    },
    enabled: !!workId,
    staleTime: 0,
  });

  const permissions: WorkPermissions = data || {
    permissionLevel: 'viewer' as const,
    canView: false,
    canCreate: false,
    canEditOthers: false,
    canDeleteOthers: false,
    canEdit: false,
    canDelete: false,
    isOwner: false,
    isShared: false,
  };

  const canEditResource = useMemo(() =>
    (resourceUserId: number) => {
      if (!user) return false;
      if (user.userId === resourceUserId) {
        return permissions.canCreate;
      }
      return permissions.canEditOthers;
    }, [user, permissions.canCreate, permissions.canEditOthers]
  );

  const canDeleteResource = useMemo(() =>
    (resourceUserId: number) => {
      if (!user) return false;
      if (user.userId === resourceUserId) {
        return permissions.canCreate;
      }
      return permissions.canDeleteOthers;
    }, [user, permissions.canCreate, permissions.canDeleteOthers]
  );

  return {
    permissions: {
      ...permissions,
      canEditResource,
      canDeleteResource,
    },
    isLoading,
    error,
    canView: permissions.canView,
    canCreate: permissions.canCreate,
    canEdit: permissions.canEdit,
    canDelete: permissions.canDelete,
    isOwner: permissions.isOwner,
    isShared: permissions.isShared,
    canEditResource,
    canDeleteResource,
  };
}
