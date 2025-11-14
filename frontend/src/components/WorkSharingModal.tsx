import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, UserPlus, Trash2, Users, Shield } from 'lucide-react';
import { workSharingApi } from '../services/api';
import type { WorkShare } from '../types/admin';
import type { WorkPermissionLevel } from '../types/permissions';
import { PERMISSION_LEVELS } from '../types/permissions';
import WorkPermissionModal from './WorkPermissionModal';

interface WorkSharingModalProps {
  workId: number;
  onClose: () => void;
}

export default function WorkSharingModal({ workId, onClose }: WorkSharingModalProps) {
  const queryClient = useQueryClient();
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [permissionLevel, setPermissionLevel] = useState<WorkPermissionLevel>('viewer');
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [editingUser, setEditingUser] = useState<string | null>(null);

  const { data: sharesData } = useQuery<{ shares: WorkShare[] }>({
    queryKey: ['work-shares', workId],
    queryFn: async () => {
      const response = await workSharingApi.getWorkShares(workId);
      return response;
    },
    staleTime: 0,
  });

  const shares = sharesData?.shares || [];

  const currentEditingShare = editingUser
    ? shares.find(s => s.username === editingUser)
    : null;
  const currentPermissionLevel = currentEditingShare?.permissionLevel || permissionLevel;

  const shareMutation = useMutation({
    mutationFn: (level?: WorkPermissionLevel) =>
      workSharingApi.shareWork(workId, editingUser || usernameOrEmail, level || permissionLevel),
    onMutate: async (level) => {
      if (editingUser && level) {
        await queryClient.cancelQueries({ queryKey: ['work-shares', workId] });

        const previousShares = queryClient.getQueryData(['work-shares', workId]);

        queryClient.setQueryData(['work-shares', workId], (old: { shares: WorkShare[] } | undefined) => {
          if (!old) return old;
          return {
            ...old,
            shares: old.shares.map(share =>
              share.username === editingUser
                ? { ...share, permissionLevel: level }
                : share
            )
          };
        });

        return { previousShares };
      }
    },
    onSuccess: () => {
      // SSE already updates cache via share:add/share:update event
      // But we also need to invalidate work permissions to ensure immediate UI updates
      queryClient.invalidateQueries({ queryKey: ['work-permissions', workId] });

      setUsernameOrEmail('');
      setPermissionLevel('viewer');
      setEditingUser(null);
      setShowPermissionModal(false);
    },
    onError: (_error, _variables, context) => {
      if (context?.previousShares) {
        queryClient.setQueryData(['work-shares', workId], context.previousShares);
      }
    },
  });

  const unshareMutation = useMutation({
    mutationFn: (identifier: string) =>
      workSharingApi.unshareWork(workId, identifier),
    onSuccess: () => {},
  });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-dark-surface border border-dark-border rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-100 flex items-center">
            <Users className="mr-2" size={24} />
            Share Work
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-300"
          >
            <X size={24} />
          </button>
        </div>

        {/* Add user form */}
        <div className="mb-6 p-4 bg-dark-bg border border-dark-border rounded-lg">
          <h3 className="text-sm font-medium text-gray-300 mb-3">Share with User</h3>
          <div className="flex items-end space-x-3">
            <div className="flex-1">
              <label className="block text-xs text-gray-400 mb-1">
                Username or Email
              </label>
              <input
                type="text"
                value={usernameOrEmail}
                onChange={(e) => setUsernameOrEmail(e.target.value)}
                placeholder="Enter username or email address"
                className="input w-full"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && usernameOrEmail) {
                    shareMutation.mutate(undefined);
                  }
                }}
              />
            </div>
            <button
              onClick={() => shareMutation.mutate(undefined)}
              disabled={!usernameOrEmail || shareMutation.isPending}
              className="btn btn-primary inline-flex items-center gap-1"
            >
              <UserPlus size={16} />
              <span>Share</span>
            </button>
          </div>
          {shareMutation.isError && (
            <p className="text-red-400 text-xs mt-2">
              {(shareMutation.error as any)?.response?.data?.error || 'Failed to share work'}
            </p>
          )}
        </div>

        {/* Shared users list */}
        <div>
          <h3 className="text-sm font-medium text-gray-300 mb-3">
            Shared With ({shares.length})
          </h3>

          {shares.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">
              This work is not shared with anyone yet
            </p>
          ) : (
            <div className="space-y-2">
              {shares.map((share) => (
                <div
                  key={share.username}
                  className="flex items-center justify-between p-3 bg-dark-bg border border-dark-border rounded-lg"
                >
                  <div className="flex-1">
                    <div className="font-medium text-gray-100">
                      {share.username}
                    </div>
                    <div className="text-xs text-gray-400">
                      {share.email}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Shared {new Date(share.sharedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={() => {
                        setEditingUser(share.username);
                        setPermissionLevel(share.permissionLevel);
                        setShowPermissionModal(true);
                      }}
                      className="text-xs px-3 py-1.5 rounded bg-blue-500 bg-opacity-20 text-blue-400 hover:bg-opacity-30 flex items-center space-x-1"
                      title="Change permissions"
                    >
                      <Shield size={14} />
                      <span>{PERMISSION_LEVELS[share.permissionLevel].name}</span>
                    </button>
                    <button
                      onClick={() => unshareMutation.mutate(share.username)}
                      disabled={unshareMutation.isPending}
                      className="text-red-400 hover:text-red-300 p-2 hover:bg-dark-hover rounded"
                      title="Remove access"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <button onClick={onClose} className="btn btn-secondary">
            Close
          </button>
        </div>
      </div>

      {/* Permission Modal (stacked on top) */}
      {showPermissionModal && editingUser && (
        <WorkPermissionModal
          username={editingUser}
          currentLevel={currentPermissionLevel}
          onSelect={(level) => {
            // Mutation will optimistically update cache for immediate feedback
            shareMutation.mutate(level);
          }}
          onClose={() => {
            setShowPermissionModal(false);
            setEditingUser(null);
          }}
          isLoading={shareMutation.isPending}
        />
      )}
    </div>
  );
}
