import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../../services/api';
import { Shield, CheckCircle, XCircle, User as UserIcon, UserPlus, X, Trash2, Key } from 'lucide-react';
import type { UserWithRoles, Role } from '../../types/admin';
import { usePermissions } from '../../hooks/usePermissions';

export default function AdminUsers() {
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const [selectedUser, setSelectedUser] = useState<UserWithRoles | null>(null);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => adminApi.getUsers(),
  });

  const { data: allRoles = [] } = useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: () => adminApi.getRoles(),
  });

  const grantRoleMutation = useMutation({
    mutationFn: ({ userId, roleId }: { userId: number; roleId: number }) =>
      adminApi.grantRole(userId, roleId),
    onMutate: async (variables) => {
      // Save the current state for rollback
      const previousUser = selectedUser;

      // Optimistically update selectedUser
      if (selectedUser?.id === variables.userId) {
        const role = allRoles.find(r => r.id === variables.roleId);
        if (role) {
          setSelectedUser({
            ...selectedUser,
            roles: [...(selectedUser.roles || []), role],
          });
        }
      }

      return { previousUser };
    },
    onError: (_error, _variables, context) => {
      // Revert optimistic update on error
      if (context?.previousUser) {
        setSelectedUser(context.previousUser);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['user', 'permissions'] });
    },
  });

  const revokeRoleMutation = useMutation({
    mutationFn: ({ userId, roleId }: { userId: number; roleId: number }) =>
      adminApi.revokeRole(userId, roleId),
    onMutate: async (variables) => {
      // Save the current state for rollback
      const previousUser = selectedUser;

      // Optimistically update selectedUser
      if (selectedUser?.id === variables.userId) {
        setSelectedUser({
          ...selectedUser,
          roles: (selectedUser.roles || []).filter(r => r.id !== variables.roleId),
        });
      }

      return { previousUser };
    },
    onError: (_error, _variables, context) => {
      // Revert optimistic update on error
      if (context?.previousUser) {
        setSelectedUser(context.previousUser);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['user', 'permissions'] });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ userId, active }: { userId: number; active: boolean }) =>
      active ? adminApi.activateUser(userId) : adminApi.deactivateUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });

  const [tempPassword, setTempPassword] = useState('');
  const [showTempPasswordModal, setShowTempPasswordModal] = useState(false);
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [resetPasswordUser, setResetPasswordUser] = useState<UserWithRoles | null>(null);
  const [newResetPassword, setNewResetPassword] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteUser, setDeleteUser] = useState<UserWithRoles | null>(null);

  const createUserMutation = useMutation({
    mutationFn: () => adminApi.createUser(newUsername, newEmail),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setShowCreateModal(false);

      // Show temporary password in a modal
      if (data.temporaryPassword) {
        setTempPassword(data.temporaryPassword);
        setShowTempPasswordModal(true);
      }

      setNewUsername('');
      setNewEmail('');
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (userId: number) => adminApi.deleteUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setShowDeleteConfirm(false);
      setDeleteUser(null);
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({ userId, password }: { userId: number; password: string }) =>
      adminApi.resetUserPassword(userId, password),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setShowResetPasswordModal(false);
      setResetPasswordUser(null);
      setNewResetPassword('');
      alert('Password reset successfully! User will be required to change it on next login.');
    },
  });

  const toggleUserRole = (userId: number, roleId: number, hasRole: boolean) => {
    if (hasRole) {
      revokeRoleMutation.mutate({ userId, roleId });
    } else {
      grantRoleMutation.mutate({ userId, roleId });
    }
  };

  if (isLoading) {
    return <div className="text-gray-400">Loading users...</div>;
  }

  return (
    <div>
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">User Management</h1>
          <p className="text-gray-400 mt-1">Manage users, roles, and permissions</p>
        </div>
        {hasPermission('admin.users.create') && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary flex items-center space-x-2"
          >
            <UserPlus size={20} />
            <span>Create User</span>
          </button>
        )}
      </div>

      {/* Users table */}
      <div className="bg-dark-surface border border-dark-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-dark-bg border-b border-dark-border">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                User
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Roles
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dark-border">
            {users.map((user: UserWithRoles) => (
              <tr key={user.id} className="hover:bg-dark-hover transition-colors">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <UserIcon size={16} className="text-gray-500 mr-2" />
                    <div className="text-sm font-medium text-gray-100">{user.username}</div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-400">{user.email}</div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-wrap gap-1">
                    {user.roles?.map((role: any) => (
                      <span
                        key={role.id}
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500 bg-opacity-20 text-blue-400"
                      >
                        {role.displayName}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {user.is_active ? (
                    <span className="inline-flex items-center text-green-400 text-sm">
                      <CheckCircle size={16} className="mr-1" />
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center text-red-400 text-sm">
                      <XCircle size={16} className="mr-1" />
                      Inactive
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex justify-end items-center space-x-3">
                    <button
                      onClick={() => {
                        setSelectedUser(user);
                        setShowRoleModal(true);
                        grantRoleMutation.reset();
                        revokeRoleMutation.reset();
                      }}
                      className="text-blue-400 hover:text-blue-300"
                      title="Manage roles"
                    >
                      <Shield size={18} />
                    </button>

                    {hasPermission('admin.users.reset_password') && (
                      <button
                        onClick={() => {
                          setResetPasswordUser(user);
                          setShowResetPasswordModal(true);
                        }}
                        className="text-yellow-400 hover:text-yellow-300"
                        title="Reset password"
                      >
                        <Key size={18} />
                      </button>
                    )}

                    <button
                      onClick={() =>
                        toggleActiveMutation.mutate({
                          userId: user.id,
                          active: !user.is_active,
                        })
                      }
                      className={`${
                        user.is_active ? 'text-red-400 hover:text-red-300' : 'text-green-400 hover:text-green-300'
                      }`}
                      title={user.is_active ? 'Deactivate' : 'Activate'}
                    >
                      {user.is_active ? <XCircle size={18} /> : <CheckCircle size={18} />}
                    </button>

                    {hasPermission('admin.users.delete') && (
                      <button
                        onClick={() => {
                          setDeleteUser(user);
                          setShowDeleteConfirm(true);
                        }}
                        className="text-red-400 hover:text-red-300"
                        title="Delete user"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Role management modal */}
      {showRoleModal && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-dark-surface border border-dark-border rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-gray-100 mb-4">
              Manage Roles for {selectedUser.username}
            </h2>

            <div className="space-y-2 mb-6">
              {allRoles.map((role: Role) => {
                const hasRole = selectedUser.roles?.some(r => r.id === role.id) || false;

                return (
                  <button
                    key={role.id}
                    onClick={() => toggleUserRole(selectedUser.id, role.id, hasRole)}
                    disabled={grantRoleMutation.isPending || revokeRoleMutation.isPending}
                    className={`w-full text-left p-4 rounded-lg border transition-colors ${
                      hasRole
                        ? 'border-blue-500 bg-blue-500 bg-opacity-20'
                        : 'border-dark-border hover:border-gray-600 hover:bg-dark-hover'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="font-medium text-gray-100">{role.displayName}</div>
                        <div className="text-sm text-gray-400 mt-1">{role.description}</div>
                      </div>
                      {hasRole && (
                        <CheckCircle size={20} className="text-blue-400 ml-2" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {(grantRoleMutation.isError || revokeRoleMutation.isError) && (
              <div className="mb-4 p-3 bg-red-500 bg-opacity-10 border border-red-500 border-opacity-30 rounded text-sm text-red-400">
                {(grantRoleMutation.error as any)?.response?.data?.error ||
                  (revokeRoleMutation.error as any)?.response?.data?.error ||
                  'Failed to update user roles. You may not have permission to perform this action.'}
              </div>
            )}

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowRoleModal(false);
                  setSelectedUser(null);
                  grantRoleMutation.reset();
                  revokeRoleMutation.reset();
                }}
                className="btn btn-secondary"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create user modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-dark-surface border border-dark-border rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-100">Create New User</h2>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewUsername('');
                  setNewEmail('');
                }}
                className="text-gray-400 hover:text-gray-300"
              >
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Username
                </label>
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="Enter username"
                  className="input w-full"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newUsername && newEmail) {
                      createUserMutation.mutate();
                    }
                  }}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="Enter email"
                  className="input w-full"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newUsername && newEmail) {
                      createUserMutation.mutate();
                    }
                  }}
                />
              </div>

              {createUserMutation.isError && (
                <p className="text-red-400 text-sm">
                  {(createUserMutation.error as any)?.response?.data?.error || 'Failed to create user'}
                </p>
              )}

              <div className="bg-blue-500 bg-opacity-10 border border-blue-500 border-opacity-30 rounded p-3 text-sm text-blue-400">
                <p>Note: A secure temporary password will be generated and shown once. Make sure to save it!</p>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewUsername('');
                  setNewEmail('');
                }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => createUserMutation.mutate()}
                disabled={!newUsername || !newEmail || createUserMutation.isPending}
                className="btn btn-primary"
              >
                {createUserMutation.isPending ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Temporary Password Modal */}
      {showTempPasswordModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-dark-surface border border-dark-border rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-100">User Created Successfully!</h2>
            </div>

            <div className="space-y-4">
              <div className="bg-green-500 bg-opacity-10 border border-green-500 border-opacity-30 rounded p-4">
                <p className="text-sm text-green-400 font-medium mb-2">
                  Temporary Password
                </p>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={tempPassword}
                    readOnly
                    className="input flex-1 font-mono text-sm"
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(tempPassword);
                      alert('Password copied to clipboard!');
                    }}
                    className="btn btn-secondary btn-sm"
                  >
                    Copy
                  </button>
                </div>
              </div>

              <div className="bg-red-500 bg-opacity-10 border border-red-500 border-opacity-30 rounded p-3 text-sm text-red-400">
                <p className="font-medium mb-1">⚠️ Important:</p>
                <p>This password will only be shown once. Make sure to save it and share it securely with the user.</p>
                <p className="mt-2">The user will be required to change this password on their first login.</p>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => {
                  setShowTempPasswordModal(false);
                  setTempPassword('');
                }}
                className="btn btn-primary"
              >
                I've Saved the Password
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showResetPasswordModal && resetPasswordUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-dark-surface border border-dark-border rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-100">Reset Password</h2>
              <button
                onClick={() => {
                  setShowResetPasswordModal(false);
                  setResetPasswordUser(null);
                  setNewResetPassword('');
                }}
                className="text-gray-400 hover:text-gray-300"
              >
                <X size={24} />
              </button>
            </div>

            <div className="mb-4">
              <p className="text-gray-300 text-sm">
                Set a new password for <span className="font-medium text-gray-100">{resetPasswordUser.username}</span>
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  New Password
                </label>
                <input
                  type="password"
                  value={newResetPassword}
                  onChange={(e) => setNewResetPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="input w-full"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newResetPassword) {
                      resetPasswordMutation.mutate({ userId: resetPasswordUser.id, password: newResetPassword });
                    }
                  }}
                />
              </div>

              <div className="bg-blue-500 bg-opacity-10 border border-blue-500 border-opacity-30 rounded p-3 text-sm text-blue-400">
                <p className="font-medium mb-2">Password Requirements:</p>
                <ul className="text-xs space-y-1 list-disc list-inside">
                  <li>At least 8 characters</li>
                  <li>One uppercase letter</li>
                  <li>One lowercase letter</li>
                  <li>One number</li>
                </ul>
              </div>

              <div className="bg-yellow-500 bg-opacity-10 border border-yellow-500 border-opacity-30 rounded p-3 text-sm text-yellow-400">
                <p>The user will be required to change this password on their next login.</p>
              </div>

              {resetPasswordMutation.isError && (
                <div className="bg-red-500 bg-opacity-10 border border-red-500 border-opacity-30 rounded p-3 text-sm text-red-400">
                  {(resetPasswordMutation.error as any)?.response?.data?.error || 'Failed to reset password'}
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => {
                  setShowResetPasswordModal(false);
                  setResetPasswordUser(null);
                  setNewResetPassword('');
                }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => resetPasswordMutation.mutate({ userId: resetPasswordUser.id, password: newResetPassword })}
                disabled={!newResetPassword || resetPasswordMutation.isPending}
                className="btn btn-primary"
              >
                {resetPasswordMutation.isPending ? 'Resetting...' : 'Reset Password'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && deleteUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-dark-surface border border-dark-border rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-red-400">Delete User</h2>
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteUser(null);
                }}
                className="text-gray-400 hover:text-gray-300"
              >
                <X size={24} />
              </button>
            </div>

            <div className="mb-6">
              <p className="text-gray-300 mb-4">
                Are you sure you want to delete user <span className="font-medium text-gray-100">{deleteUser.username}</span>?
              </p>
              <div className="bg-red-500 bg-opacity-10 border border-red-500 border-opacity-30 rounded p-3 text-sm text-red-400">
                <p className="font-medium mb-1">⚠️ Warning:</p>
                <p>This action is permanent and cannot be undone. All associated data (works, sessions, timeline entries) will also be deleted.</p>
              </div>
            </div>

            {deleteUserMutation.isError && (
              <div className="mb-4 bg-red-500 bg-opacity-10 border border-red-500 border-opacity-30 rounded p-3 text-sm text-red-400">
                {(deleteUserMutation.error as any)?.response?.data?.error || 'Failed to delete user'}
              </div>
            )}

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteUser(null);
                }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteUserMutation.mutate(deleteUser.id)}
                disabled={deleteUserMutation.isPending}
                className="btn bg-red-600 hover:bg-red-700 text-white"
              >
                {deleteUserMutation.isPending ? 'Deleting...' : 'Delete User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
