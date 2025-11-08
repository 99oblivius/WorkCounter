import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Palette, Moon, Sun } from 'lucide-react';
import { useUserSettings } from '../hooks/useUserSettings';

// Preset accent colors
const PRESET_COLORS = [
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Green', value: '#10b981' },
  { name: 'Purple', value: '#8b5cf6' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Orange', value: '#f59e0b' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Teal', value: '#14b8a6' },
  { name: 'Indigo', value: '#6366f1' },
];

export default function UserSettings() {
  const navigate = useNavigate();
  const { settings, updateSettings, isUpdating } = useUserSettings();

  const [theme, setTheme] = useState(settings.theme);
  const [accentColor, setAccentColor] = useState(settings.accentColor);
  const [hasChanges, setHasChanges] = useState(false);

  // Update local state when settings load
  useEffect(() => {
    setTheme(settings.theme);
    setAccentColor(settings.accentColor);
  }, [settings]);

  // Track changes
  useEffect(() => {
    const changed =
      theme !== settings.theme || accentColor !== settings.accentColor;
    setHasChanges(changed);
  }, [theme, accentColor, settings]);

  const handleSave = () => {
    updateSettings({ theme, accentColor });
  };

  const handleReset = () => {
    setTheme(settings.theme);
    setAccentColor(settings.accentColor);
  };

  return (
    <div className="min-h-screen bg-dark-bg">
      <header className="bg-dark-surface border-b border-dark-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/dashboard')}
                className="p-2 rounded-md text-gray-400 hover:text-gray-300 hover:bg-dark-hover"
              >
                <ArrowLeft size={20} />
              </button>
              <h1 className="text-2xl font-bold text-gray-100">User Settings</h1>
            </div>
            {hasChanges && (
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleReset}
                  className="btn btn-secondary"
                  disabled={isUpdating}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="btn btn-primary flex items-center space-x-2"
                  disabled={isUpdating}
                >
                  <Save size={16} />
                  <span>{isUpdating ? 'Saving...' : 'Save Changes'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-6">
          {/* Theme Selection */}
          <div className="card">
            <div className="flex items-center space-x-3 mb-4">
              {theme === 'dark' ? <Moon size={24} className="text-blue-500" /> : <Sun size={24} className="text-blue-500" />}
              <h2 className="text-xl font-semibold text-gray-100">Theme</h2>
            </div>
            <p className="text-sm text-gray-400 mb-4">
              Choose between dark and light theme for the application
            </p>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setTheme('dark')}
                className={`p-4 rounded-lg border-2 transition-all ${
                  theme === 'dark'
                    ? 'border-blue-500 bg-blue-500 bg-opacity-10'
                    : 'border-dark-border bg-dark-bg hover:border-gray-600'
                }`}
              >
                <div className="flex flex-col items-center space-y-2">
                  <Moon size={32} className={theme === 'dark' ? 'text-blue-500' : 'text-gray-400'} />
                  <span className={`font-medium ${theme === 'dark' ? 'text-blue-500' : 'text-gray-300'}`}>
                    Dark
                  </span>
                  {theme === 'dark' && (
                    <span className="text-xs text-gray-500">Current</span>
                  )}
                </div>
              </button>
              <button
                onClick={() => setTheme('light')}
                className={`p-4 rounded-lg border-2 transition-all ${
                  theme === 'light'
                    ? 'border-blue-500 bg-blue-500 bg-opacity-10'
                    : 'border-dark-border bg-dark-bg hover:border-gray-600'
                }`}
              >
                <div className="flex flex-col items-center space-y-2">
                  <Sun size={32} className={theme === 'light' ? 'text-blue-500' : 'text-gray-400'} />
                  <span className={`font-medium ${theme === 'light' ? 'text-blue-500' : 'text-gray-300'}`}>
                    Light
                  </span>
                  {theme === 'light' && (
                    <span className="text-xs text-gray-500">Current</span>
                  )}
                </div>
              </button>
            </div>
          </div>

          {/* Accent Color Selection */}
          <div className="card">
            <div className="flex items-center space-x-3 mb-4">
              <Palette size={24} className="text-blue-500" />
              <h2 className="text-xl font-semibold text-gray-100">Accent Color</h2>
            </div>
            <p className="text-sm text-gray-400 mb-4">
              Choose your preferred accent color for buttons and highlights
            </p>

            {/* Preset Colors */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-300 mb-3">Preset Colors</h3>
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
                {PRESET_COLORS.map((preset) => (
                  <button
                    key={preset.value}
                    onClick={() => setAccentColor(preset.value)}
                    className={`relative aspect-square rounded-lg border-2 transition-all hover:scale-110 ${
                      accentColor === preset.value
                        ? 'border-gray-300 ring-2 ring-offset-2 ring-offset-dark-surface ring-gray-300'
                        : 'border-dark-border hover:border-gray-600'
                    }`}
                    style={{ backgroundColor: preset.value }}
                    title={preset.name}
                  >
                    {accentColor === preset.value && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-3 h-3 bg-white rounded-full shadow-lg"></div>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Color Picker */}
            <div>
              <h3 className="text-sm font-medium text-gray-300 mb-3">Custom Color</h3>
              <div className="flex items-center space-x-4">
                <div className="relative">
                  <input
                    type="color"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="w-20 h-20 rounded-lg cursor-pointer border-2 border-dark-border"
                  />
                </div>
                <div className="flex-1">
                  <input
                    type="text"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    pattern="^#[0-9A-Fa-f]{6}$"
                    placeholder="#3b82f6"
                    className="input w-full font-mono"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Enter a hex color code (e.g., #3b82f6)
                  </p>
                </div>
              </div>
            </div>

            {/* Color Preview */}
            <div className="mt-6 p-4 bg-dark-bg rounded-lg border border-dark-border">
              <h3 className="text-sm font-medium text-gray-300 mb-3">Preview</h3>
              <div className="flex flex-wrap gap-3">
                <button
                  className="px-4 py-2 rounded-md font-medium text-white transition-colors"
                  style={{ backgroundColor: accentColor }}
                >
                  Primary Button
                </button>
                <div
                  className="px-4 py-2 rounded-md border-2 font-medium transition-colors"
                  style={{ borderColor: accentColor, color: accentColor }}
                >
                  Outlined Button
                </div>
                <div className="px-4 py-2">
                  <span className="text-gray-300">Text with </span>
                  <span style={{ color: accentColor }} className="font-medium">
                    accent color
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Save reminder */}
          {hasChanges && (
            <div className="card bg-yellow-500 bg-opacity-10 border-yellow-500 border-opacity-30">
              <p className="text-yellow-500 text-sm">
                You have unsaved changes. Don't forget to save your settings!
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
