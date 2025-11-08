import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../../services/adminApi';
import { Filter } from 'lucide-react';
import type { AuditLog } from '../../types/admin';

export default function AdminAuditLogs() {
  const [filters, setFilters] = useState({
    action: '',
    status: '',
    limit: 50,
    offset: 0,
  });

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['admin', 'audit', 'logs', filters],
    queryFn: () => adminApi.getAuditLogs(filters),
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'text-green-400';
      case 'failure':
        return 'text-red-400';
      case 'warning':
        return 'text-yellow-400';
      default:
        return 'text-gray-400';
    }
  };

  const formatAction = (action: string) => {
    return action
      .split('.')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-100">Audit Logs</h1>
        <p className="text-gray-400 mt-1">View system activity and security events</p>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex items-center space-x-4">
          <Filter size={20} className="text-gray-400" />

          <select
            value={filters.action}
            onChange={(e) => setFilters({ ...filters, action: e.target.value, offset: 0 })}
            className="input"
          >
            <option value="">All Actions</option>
            <option value="user.created">User Created</option>
            <option value="user.role_granted">Role Granted</option>
            <option value="user.role_revoked">Role Revoked</option>
            <option value="user.activated">User Activated</option>
            <option value="user.deactivated">User Deactivated</option>
            <option value="setting.updated">Setting Updated</option>
            <option value="work.shared">Work Shared</option>
            <option value="work.unshared">Work Unshared</option>
            <option value="access.denied">Access Denied</option>
          </select>

          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value, offset: 0 })}
            className="input"
          >
            <option value="">All Status</option>
            <option value="success">Success</option>
            <option value="failure">Failure</option>
            <option value="warning">Warning</option>
          </select>

          <select
            value={filters.limit}
            onChange={(e) => setFilters({ ...filters, limit: parseInt(e.target.value), offset: 0 })}
            className="input"
          >
            <option value="25">25 per page</option>
            <option value="50">50 per page</option>
            <option value="100">100 per page</option>
          </select>

          {(filters.action || filters.status) && (
            <button
              onClick={() => setFilters({ action: '', status: '', limit: 50, offset: 0 })}
              className="btn btn-secondary btn-sm"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-dark-surface border border-dark-border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading audit logs...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No audit logs found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-dark-bg border-b border-dark-border">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Timestamp
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Action
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Resource
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-border">
                {logs.map((log: AuditLog) => (
                  <tr key={log.id} className="hover:bg-dark-hover transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                      {log.username || <span className="text-gray-600">System</span>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                      {formatAction(log.action)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                      {log.resource_type && (
                        <>
                          {log.resource_type}
                          {log.resource_id && ` #${log.resource_id}`}
                        </>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`text-sm font-medium ${getStatusColor(log.status)}`}>
                        {log.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {logs.length > 0 && (
          <div className="px-6 py-4 bg-dark-bg border-t border-dark-border flex items-center justify-between">
            <div className="text-sm text-gray-400">
              Showing {filters.offset + 1} - {filters.offset + logs.length}
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => setFilters({ ...filters, offset: Math.max(0, filters.offset - filters.limit) })}
                disabled={filters.offset === 0}
                className="btn btn-secondary btn-sm"
              >
                Previous
              </button>
              <button
                onClick={() => setFilters({ ...filters, offset: filters.offset + filters.limit })}
                disabled={logs.length < filters.limit}
                className="btn btn-secondary btn-sm"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
