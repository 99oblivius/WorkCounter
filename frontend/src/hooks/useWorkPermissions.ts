import { useQuery } from '@tanstack/react-query';
import { worksApi, WorkPermissions } from '../services/api';

/**
 * Hook to fetch and cache work permissions for the current user
 * @param workId - The ID of the work to check permissions for
 * @returns Work permissions object with loading and error states
 */
export function useWorkPermissions(workId: number | undefined) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['work-permissions', workId],
    queryFn: async () => {
      if (!workId) return null;
      const response = await worksApi.getPermissions(workId);
      return response.data;
    },
    enabled: !!workId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const permissions: WorkPermissions = data || {
    canView: false,
    canEdit: false,
    canDelete: false,
    isOwner: false,
    isShared: false,
  };

  return {
    permissions,
    isLoading,
    error,
    // Helper methods for cleaner code
    canView: permissions.canView,
    canEdit: permissions.canEdit,
    canDelete: permissions.canDelete,
    isOwner: permissions.isOwner,
    isShared: permissions.isShared,
  };
}
