import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userSettingsApi } from '../services/api';
import { useEffect } from 'react';

export type Theme = 'dark' | 'light';

export interface UserSettings {
  theme: Theme;
  accentColor: string;
}

function applyTheme(theme: Theme) {
  const html = document.documentElement;
  html.classList.remove('dark', 'light');
  html.classList.add(theme);
  localStorage.setItem('theme', theme);
}

function applyAccentColor(color: string) {
  document.documentElement.style.setProperty('--accent-color', color);
  localStorage.setItem('accentColor', color);
}

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
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });

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
      await queryClient.cancelQueries({ queryKey: ['user-settings'] });

      const previousSettings = queryClient.getQueryData<UserSettings>(['user-settings']);

      queryClient.setQueryData<UserSettings>(['user-settings'], (old) => ({
        ...old!,
        ...newSettings,
      }));

      if (newSettings.theme) {
        applyTheme(newSettings.theme);
      }
      if (newSettings.accentColor) {
        applyAccentColor(newSettings.accentColor);
      }

      return { previousSettings };
    },
    onError: (_err, _newSettings, context) => {
      if (context?.previousSettings) {
        queryClient.setQueryData(['user-settings'], context.previousSettings);
        applyTheme(context.previousSettings.theme);
        applyAccentColor(context.previousSettings.accentColor);
      }
    },
    onSuccess: () => {
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
