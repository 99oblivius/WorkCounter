import { useQuery } from '@tanstack/react-query';
import { settingsApi } from '../services/adminApi';

export function useSettings() {
  const { data: settings = {}, isLoading } = useQuery({
    queryKey: ['settings', 'public'],
    queryFn: () => settingsApi.getPublicSettings(),
    staleTime: 60000, // 1 minute
  });

  return {
    settings,
    isLoading,
    // File settings
    maxFileSize: settings['files.max_file_size'] || 5368709120,
    maxImageSize: settings['files.max_image_size'] || 52428800,
    maxNoteImages: settings['files.max_note_images'] || 9,
    allowedExtensions: settings['files.allowed_extensions'] || [],
    uploadEnabled: settings['files.upload_enabled'] !== false,
    // General settings
    siteName: settings['general.site_name'] || 'WorkCounter',
    maintenanceMode: settings['general.maintenance_mode'] === true,
  };
}
