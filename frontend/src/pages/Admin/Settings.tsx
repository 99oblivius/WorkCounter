import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../../services/adminApi';
import { Save, RotateCcw, X } from 'lucide-react';
import type { SystemSetting } from '../../types/admin';

export default function AdminSettings() {
  const queryClient = useQueryClient();
  const [editedValues, setEditedValues] = useState<Record<string, any>>({});

  const { data: settings = [], isLoading } = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => adminApi.getSettings(),
  });

  const updateMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: any }) =>
      adminApi.updateSetting(key, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
      queryClient.invalidateQueries({ queryKey: ['settings', 'public'] });
    },
  });

  const handleSave = (setting: SystemSetting) => {
    const value = editedValues[setting.key] ?? setting.value;
    updateMutation.mutate({ key: setting.key, value });
    const newValues = { ...editedValues };
    delete newValues[setting.key];
    setEditedValues(newValues);
  };

  const handleReset = (setting: SystemSetting) => {
    const newValues = { ...editedValues };
    delete newValues[setting.key];
    setEditedValues(newValues);
  };

  const handleRevertToDefault = (setting: SystemSetting) => {
    if (setting.defaultValue) {
      let defaultVal: any = setting.defaultValue;
      if (setting.valueType === 'number') {
        defaultVal = parseFloat(setting.defaultValue);
      } else if (setting.valueType === 'boolean') {
        defaultVal = setting.defaultValue === 'true';
      }
      updateMutation.mutate({ key: setting.key, value: defaultVal });
    }
  };

  const groupedSettings = settings.reduce((acc: Record<string, SystemSetting[]>, setting: SystemSetting) => {
    if (!acc[setting.category]) {
      acc[setting.category] = [];
    }
    acc[setting.category].push(setting);
    return acc;
  }, {});

  if (isLoading) {
    return <div className="text-gray-400">Loading settings...</div>;
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-100">System Settings</h1>
        <p className="text-gray-400 mt-1">Configure application settings and limits</p>
      </div>

      {Object.entries(groupedSettings).map(([category, categorySettings]) => (
        <div key={category} className="mb-8">
          <h2 className="text-lg font-semibold text-gray-100 mb-4 capitalize">
            {category} Settings
          </h2>

          <div className="bg-dark-surface border border-dark-border rounded-lg divide-y divide-dark-border">
            {categorySettings.map((setting: SystemSetting) => {
              const currentValue = editedValues[setting.key] ?? setting.value;
              const hasChanges = editedValues.hasOwnProperty(setting.key);

              // Parse value based on type
              let displayValue = currentValue;
              if (setting.valueType === 'number') {
                displayValue = parseFloat(currentValue);
              } else if (setting.valueType === 'boolean') {
                displayValue = currentValue === 'true' || currentValue === true;
              }

              const formatLabel = (key: string) => {
                return key
                  .split('.')
                  .pop()!
                  .split('_')
                  .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                  .join(' ');
              };

              const formatValue = (value: any, type: string) => {
                if (type === 'number' && setting.key.includes('size')) {
                  const bytes = Number(value);
                  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
                  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(0)} MB`;
                  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
                  return `${bytes} bytes`;
                }
                return value;
              };

              return (
                <div key={setting.key} className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-100 mb-1">
                        {formatLabel(setting.key)}
                      </label>
                      <p className="text-xs text-gray-400 mb-1">{setting.description}</p>
                      <p className="text-xs text-gray-500 mb-3">Key: {setting.key}</p>

                      {setting.valueType === 'boolean' ? (
                        <label className="inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={displayValue}
                            onChange={(e) =>
                              setEditedValues({
                                ...editedValues,
                                [setting.key]: e.target.checked,
                              })
                            }
                            className="sr-only peer"
                          />
                          <div className="relative w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                      ) : setting.valueType === 'number' ? (
                        <input
                          type="number"
                          value={displayValue}
                          onChange={(e) =>
                            setEditedValues({
                              ...editedValues,
                              [setting.key]: parseInt(e.target.value),
                            })
                          }
                          min={setting.minValue}
                          max={setting.maxValue}
                          className="input w-full max-w-xs"
                        />
                      ) : (
                        <input
                          type="text"
                          value={displayValue}
                          onChange={(e) =>
                            setEditedValues({
                              ...editedValues,
                              [setting.key]: e.target.value,
                            })
                          }
                          className="input w-full max-w-md"
                        />
                      )}

                      <div className="mt-2 text-xs text-gray-500 space-y-1">
                        {setting.valueType !== 'boolean' && (
                          <div>Current: {formatValue(displayValue, setting.valueType)}</div>
                        )}
                        {setting.defaultValue && (
                          <div>Default: {formatValue(setting.defaultValue, setting.valueType)}</div>
                        )}
                        {setting.minValue !== undefined && setting.maxValue !== undefined && (
                          <div>Range: {setting.minValue} - {setting.maxValue}</div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col items-end space-y-2 ml-4">
                      {hasChanges && (
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleReset(setting)}
                            className="btn btn-secondary btn-sm"
                            title="Cancel changes"
                          >
                            <X size={16} />
                          </button>
                          <button
                            onClick={() => handleSave(setting)}
                            className="btn btn-primary btn-sm"
                            title="Save changes"
                            disabled={updateMutation.isPending}
                          >
                            <Save size={16} />
                          </button>
                        </div>
                      )}
                      {setting.defaultValue && setting.value !== setting.defaultValue && (
                        <button
                          onClick={() => handleRevertToDefault(setting)}
                          className="btn btn-secondary btn-sm text-xs"
                          title="Revert to default value"
                          disabled={updateMutation.isPending}
                        >
                          <RotateCcw size={14} className="mr-1" />
                          Revert to Default
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
