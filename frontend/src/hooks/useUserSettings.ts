import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userSettingsApi } from '../services/api';
import { useEffect } from 'react';

export type Theme = 'dark' | 'light';

export interface UserSettings {
  theme: Theme;
  accentColor: string;
}

// Apply theme to the document
function applyTheme(theme: Theme) {
  const html = document.documentElement;

  // Remove both classes first
  html.classList.remove('dark', 'light');

  // Add the selected theme class
  html.classList.add(theme);

  // Store in localStorage for immediate access on next load
  localStorage.setItem('theme', theme);
}

// Apply accent color to the document
function applyAccentColor(color: string) {
  document.documentElement.style.setProperty('--accent-color', color);

  // Store in localStorage for immediate access on next load
  localStorage.setItem('accentColor', color);
}

// Apply settings from localStorage immediately (before API loads)
function applyStoredSettings() {
  const storedTheme = localStorage.getItem('theme') as Theme | null;
  const storedAccentColor = localStorage.getItem('accentColor');

  if (storedTheme) {
    applyTheme(storedTheme);
  }

  if (storedAccentColor) {
    applyAccentColor(storedAccentColor);
  }
}

// Initialize theme on module load (before React renders)
applyStoredSettings();

export function useUserSettings() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading, error } = useQuery({
    queryKey: ['user-settings'],
    queryFn: async () => {
      const response = await userSettingsApi.getAll();
      const data = response.data;
      return {
        theme: (data.theme as Theme) || 'dark',
        accentColor: data.accentColor || '#3b82f6',
      } as UserSettings;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 1,
  });

  // Apply settings when they load from the API
  useEffect(() => {
    if (settings) {
      applyTheme(settings.theme || 'dark');
      applyAccentColor(settings.accentColor || '#3b82f6');
    }
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: async (newSettings: Partial<UserSettings>) => {
      const response = await userSettingsApi.update(newSettings);
      return response.data;
    },
    onMutate: async (newSettings) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['user-settings'] });

      // Snapshot previous value
      const previousSettings = queryClient.getQueryData<UserSettings>(['user-settings']);

      // Optimistically update
      queryClient.setQueryData<UserSettings>(['user-settings'], (old) => ({
        ...old!,
        ...newSettings,
      }));

      // Apply settings immediately
      if (newSettings.theme) {
        applyTheme(newSettings.theme);
      }
      if (newSettings.accentColor) {
        applyAccentColor(newSettings.accentColor);
      }

      return { previousSettings };
    },
    onError: (_err, _newSettings, context) => {
      // Rollback on error
      if (context?.previousSettings) {
        queryClient.setQueryData(['user-settings'], context.previousSettings);
        applyTheme(context.previousSettings.theme);
        applyAccentColor(context.previousSettings.accentColor);
      }
    },
    onSuccess: () => {
      // Refetch to get server state
      queryClient.invalidateQueries({ queryKey: ['user-settings'] });
    },
  });

  const updateSingleMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const response = await userSettingsApi.updateSingle(key, value);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-settings'] });
    },
  });

  return {
    settings: settings || { theme: 'dark' as Theme, accentColor: '#3b82f6' },
    isLoading,
    error,
    updateSettings: updateMutation.mutate,
    updateSingleSetting: updateSingleMutation.mutate,
    isUpdating: updateMutation.isPending || updateSingleMutation.isPending,
  };
}
