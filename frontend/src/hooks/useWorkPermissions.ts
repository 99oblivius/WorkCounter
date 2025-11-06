import { useQuery } from '@tanstack/react-query';
import { worksApi, WorkPermissions } from '../services/api';
import { useAuth } from './useAuth';

/**
 * Hook to fetch and cache work permissions for the current user
 * @param workId - The ID of the work to check permissions for
 * @returns Work permissions object with loading and error states
 */
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
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
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

  // Helper function: Can edit a resource (ownership-aware)
  // Requires at least Editor permission (canCreate) to edit own content
  // Requires Manager permission (canEditOthers) to edit others' content
  const canEditResource = (resourceUserId: number) => {
    if (!user) return false;
    // Owner of resource can edit IF they have at least Editor permission
    if (user.userId === resourceUserId) {
      return permissions.canCreate; // Editor+ can edit own content
    }
    // Managers can edit anyone's content
    return permissions.canEditOthers;
  };

  // Helper function: Can delete a resource (ownership-aware)
  // Requires at least Editor permission (canCreate) to delete own content
  // Requires Manager permission (canDeleteOthers) to delete others' content
  const canDeleteResource = (resourceUserId: number) => {
    if (!user) return false;
    // Owner of resource can delete IF they have at least Editor permission
    if (user.userId === resourceUserId) {
      return permissions.canCreate; // Editor+ can delete own content
    }
    // Managers can delete anyone's content
    return permissions.canDeleteOthers;
  };

  return {
    permissions: {
      ...permissions,
      canEditResource,
      canDeleteResource,
    },
    isLoading,
    error,
    // Legacy flat props for backwards compatibility
    canView: permissions.canView,
    canCreate: permissions.canCreate,
    canEdit: permissions.canEdit,
    canDelete: permissions.canDelete,
    isOwner: permissions.isOwner,
    isShared: permissions.isShared,
    // New helpers
    canEditResource,
    canDeleteResource,
  };
}
