import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { X, UserPlus, Trash2, Users, Shield } from 'lucide-react';
import { workSharingApi } from '../services/adminApi';
import type { WorkShare } from '../types/admin';
import type { WorkPermissionLevel } from '../types/permissions';
import { PERMISSION_LEVELS } from '../types/permissions';
import WorkPermissionModal from './WorkPermissionModal';

interface WorkSharingModalProps {
  workId: number;
  shares: WorkShare[];
  onClose: () => void;
}

export default function WorkSharingModal({ workId, shares, onClose }: WorkSharingModalProps) {
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [permissionLevel, setPermissionLevel] = useState<WorkPermissionLevel>('viewer');
  const [currentShares, setCurrentShares] = useState<WorkShare[]>(shares);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [editingUser, setEditingUser] = useState<string | null>(null);

  // Sync local state when shares prop changes
  useEffect(() => {
    setCurrentShares(shares);
  }, [shares]);

  const shareMutation = useMutation({
    mutationFn: (level?: WorkPermissionLevel) =>
      workSharingApi.shareWork(workId, editingUser || usernameOrEmail, level || permissionLevel),
    onSuccess: () => {
      // SSE already updates cache via share:add event in useWorkStream
      setUsernameOrEmail('');
      setPermissionLevel('viewer');
      setEditingUser(null);
      setShowPermissionModal(false);
    },
  });

  const unshareMutation = useMutation({
    mutationFn: (identifier: string) =>
      workSharingApi.unshareWork(workId, identifier),
    onSuccess: () => {
      // SSE already updates cache via share:remove event in useWorkStream
    },
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
            Shared With ({currentShares.length})
          </h3>

          {currentShares.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">
              This work is not shared with anyone yet
            </p>
          ) : (
            <div className="space-y-2">
              {currentShares.map((share) => (
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
          currentLevel={permissionLevel}
          onSelect={(level) => {
            setPermissionLevel(level);
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
