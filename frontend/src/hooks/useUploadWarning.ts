import { useEffect } from 'react';
import { useUploadQueue } from '../stores/uploadQueueStore';

/**
 * Warn user before leaving page if uploads are in progress
 * Prevents accidental data loss (Dropbox-style)
 */
export function useUploadWarning() {
  const isUploading = useUploadQueue((state) => state.isUploading());

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isUploading) {
        // Modern browsers ignore custom messages, but still show a warning
        e.preventDefault();
        e.returnValue = ''; // Required for Chrome
        return ''; // Required for other browsers
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isUploading]);
}
