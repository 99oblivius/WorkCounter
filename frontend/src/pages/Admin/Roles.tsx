import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../../services/adminApi';
import { Shield, Lock } from 'lucide-react';
import type { Role, Permission } from '../../types/admin';

export default function AdminRoles() {
  const { data: roles = [], isLoading } = useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: () => adminApi.getRoles(),
  });

  if (isLoading) {
    return <div className="text-gray-400">Loading roles...</div>;
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-100">Roles & Permissions</h1>
        <p className="text-gray-400 mt-1">View role configurations and permissions</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {roles.map((role: Role) => (
          <div key={role.id} className="card">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-blue-500 bg-opacity-20 rounded-lg">
                  <Shield className="text-blue-400" size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-100">{role.displayName}</h3>
                  <p className="text-sm text-gray-400">{role.description}</p>
                </div>
              </div>
              {role.isSystem && (
                <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-700 text-gray-300">
                  <Lock size={12} className="mr-1" />
                  System
                </span>
              )}
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-300">
                Permissions ({role.permissions?.length || 0})
              </h4>

              {role.permissions && role.permissions.length > 0 ? (
                <div className="grid grid-cols-1 gap-1 max-h-64 overflow-y-auto">
                  {role.permissions.map((perm: Permission) => (
                    <div
                      key={perm.id}
                      className="flex items-center justify-between p-2 bg-dark-bg rounded text-xs"
                    >
                      <div>
                        <div className="text-gray-300 font-medium">{perm.displayName}</div>
                        <div className="text-gray-500">{perm.name}</div>
                      </div>
                      <span className="text-gray-600 capitalize px-2 py-0.5 bg-dark-surface rounded">
                        {perm.category}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">No permissions assigned</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
