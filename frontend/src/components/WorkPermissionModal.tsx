import { X, CheckCircle } from 'lucide-react';
import { WorkPermissionLevel, PERMISSION_LEVELS } from '../types/permissions';

interface WorkPermissionModalProps {
  username: string;
  currentLevel: WorkPermissionLevel;
  onSelect: (level: WorkPermissionLevel) => void;
  onClose: () => void;
  isLoading?: boolean;
}

export default function WorkPermissionModal({
  username,
  currentLevel,
  onSelect,
  onClose,
  isLoading = false
}: WorkPermissionModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
      <div className="bg-dark-surface border border-dark-border rounded-lg p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-100">
            Set Permissions for @{username}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-300"
            disabled={isLoading}
          >
            <X size={24} />
          </button>
        </div>

        <div className="space-y-3 mb-6">
          {(Object.keys(PERMISSION_LEVELS) as WorkPermissionLevel[]).map((level) => {
            const info = PERMISSION_LEVELS[level];
            const isSelected = currentLevel === level;

            return (
              <button
                key={level}
                onClick={() => onSelect(level)}
                disabled={isLoading}
                className={`w-full text-left p-4 rounded-lg border transition-colors ${
                  isSelected
                    ? 'border-blue-500 bg-blue-500 bg-opacity-20'
                    : 'border-dark-border hover:border-gray-600 hover:bg-dark-hover'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="font-medium text-gray-100 mb-2">{info.name}</div>
                    <div className="text-sm text-gray-400 space-y-1">
                      {info.description.map((line, i) => (
                        <div key={i}>{line}</div>
                      ))}
                    </div>
                  </div>
                  {isSelected && (
                    <CheckCircle size={20} className="text-blue-400 ml-3 flex-shrink-0" />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="btn btn-secondary"
            disabled={isLoading}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
