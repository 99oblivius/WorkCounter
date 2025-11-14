import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../../services/api';
import { Users, Shield, Settings, Activity } from 'lucide-react';

export default function AdminDashboard() {
  const { data: users = [] } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => adminApi.getUsers(),
  });

  const { data: roles = [] } = useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: () => adminApi.getRoles(),
  });

  const { data: stats = [] } = useQuery({
    queryKey: ['admin', 'audit', 'stats'],
    queryFn: () => adminApi.getAuditStats(7),
  });

  const activeUsers = users.filter(u => u.is_active).length;
  const totalActions = stats.reduce((sum, s) => sum + parseInt(s.count || 0), 0);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-100">Admin Dashboard</h1>
        <p className="text-gray-400 mt-1">System overview and statistics</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Total Users</p>
              <p className="text-3xl font-bold text-gray-100 mt-1">{users.length}</p>
            </div>
            <div className="p-3 bg-blue-500 bg-opacity-20 rounded-lg">
              <Users className="text-blue-400" size={24} />
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-2">{activeUsers} active</p>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Roles</p>
              <p className="text-3xl font-bold text-gray-100 mt-1">{roles.length}</p>
            </div>
            <div className="p-3 bg-purple-500 bg-opacity-20 rounded-lg">
              <Shield className="text-purple-400" size={24} />
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-2">Permission system</p>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">System Settings</p>
              <p className="text-3xl font-bold text-gray-100 mt-1">10</p>
            </div>
            <div className="p-3 bg-green-500 bg-opacity-20 rounded-lg">
              <Settings className="text-green-400" size={24} />
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-2">Configurable</p>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Actions (7d)</p>
              <p className="text-3xl font-bold text-gray-100 mt-1">{totalActions}</p>
            </div>
            <div className="p-3 bg-orange-500 bg-opacity-20 rounded-lg">
              <Activity className="text-orange-400" size={24} />
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-2">Audit trail</p>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="card">
        <h2 className="text-lg font-bold text-gray-100 mb-4">Recent Actions</h2>
        {stats.length > 0 ? (
          <div className="space-y-2">
            {stats.slice(0, 5).map((stat: any, i: number) => (
              <div
                key={i}
                className="flex items-center justify-between p-3 bg-dark-bg rounded-lg"
              >
                <div>
                  <p className="text-gray-300 font-medium">{stat.action}</p>
                  <p className="text-xs text-gray-500">
                    {stat.unique_users} unique users
                  </p>
                </div>
                <div className="text-gray-400 font-mono">{stat.count} times</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-4">No recent activity</p>
        )}
      </div>
    </div>
  );
}
