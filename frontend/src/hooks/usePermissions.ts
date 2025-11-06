import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../services/adminApi';
import { useAuth } from './useAuth';

export function usePermissions() {
  const { user } = useAuth();

  const { data: userData } = useQuery({
    queryKey: ['user', 'permissions', user?.userId],
    queryFn: () => user?.userId ? adminApi.getUser(user.userId) : null,
    enabled: !!user?.userId,
    staleTime: 0, // Always fetch fresh permissions - security critical
    refetchOnMount: true, // Refetch when component mounts
    refetchOnWindowFocus: true, // Refetch when window regains focus
  });

  const roles = userData?.roles || [];
  // Extract all permissions from all roles (permissions stack)
  const permissions = roles.flatMap(role =>
    (role.permissions || []).map(p => p.name)
  );

  const hasPermission = (permission: string): boolean => {
    return permissions.includes(permission);
  };

  const hasAnyPermission = (perms: string[]): boolean => {
    return perms.some(p => permissions.includes(p));
  };

  const hasAllPermissions = (perms: string[]): boolean => {
    return perms.every(p => permissions.includes(p));
  };

  const hasRole = (roleName: string): boolean => {
    return roles.some(r => r.name === roleName);
  };

  const isAdmin = hasPermission('admin.access');

  return {
    permissions,
    roles,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    hasRole,
    isAdmin,
    isLoading: !userData && !!user?.userId,
  };
}
