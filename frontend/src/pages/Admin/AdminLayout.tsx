import { Outlet, NavLink, Navigate } from 'react-router-dom';
import { usePermissions } from '../../hooks/usePermissions';
import {
  Users,
  Settings,
  FileText,
  Shield,
  Home,
  ArrowLeft
} from 'lucide-react';

export default function AdminLayout() {
  const { hasPermission, isLoading } = usePermissions();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-dark-bg flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  // Redirect if no admin access
  if (!hasPermission('admin.access')) {
    return <Navigate to="/" replace />;
  }

  const navItems = [
    { path: '/admin', label: 'Dashboard', icon: Home, exact: true },
    { path: '/admin/users', label: 'Users', icon: Users },
    { path: '/admin/roles', label: 'Roles & Permissions', icon: Shield },
    { path: '/admin/settings', label: 'Settings', icon: Settings },
    { path: '/admin/audit', label: 'Audit Logs', icon: FileText },
  ];

  return (
    <div className="min-h-screen bg-dark-bg flex">
      {/* Sidebar */}
      <aside className="w-64 h-screen sticky top-0 bg-dark-surface border-r border-dark-border flex flex-col">
        <div className="p-6 flex-shrink-0">
          <h1 className="text-xl font-bold text-gray-100">Admin Panel</h1>
          <p className="text-sm text-gray-400 mt-1">WorkCounter</p>
        </div>

        <nav className="px-4 space-y-1 flex-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.exact}
                className={({ isActive }) =>
                  `flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-blue-500 bg-opacity-20 text-blue-400 border border-blue-500 border-opacity-30'
                      : 'text-gray-400 hover:bg-dark-hover hover:text-gray-300'
                  }`
                }
              >
                <Icon size={20} />
                <span className="font-medium">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="p-4 border-t border-dark-border flex-shrink-0">
          <NavLink
            to="/"
            className="flex items-center space-x-3 px-4 py-3 rounded-lg text-gray-400 hover:bg-dark-hover hover:text-gray-300 transition-colors"
          >
            <ArrowLeft size={20} />
            <span>Back to App</span>
          </NavLink>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
