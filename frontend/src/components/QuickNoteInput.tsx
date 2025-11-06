import { useState, useRef, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Send, Tag, Paperclip } from 'lucide-react';
import { timelineApi } from '../services/api';
import { useUserPermissions } from '../hooks/useUserPermissions';
import type { PendingImage } from '../types';
import PendingImagePreview from './PendingImagePreview';
import { FILE_SIZE_LIMITS, FILE_MESSAGES, validateImageFile } from '../config/fileConfig';

interface QuickNoteInputProps {
  workId: number;
  sessionId: number;
  onSuccess: () => void;
}

const ACTIVITY_TYPES = [
  'Development',
  'Design',
  'Meeting',
  'Research',
  'Review',
  'Testing',
  'Documentation',
  'Planning',
  'Bug Fix',
  'Other',
];

const MAX_IMAGES = FILE_SIZE_LIMITS.MAX_NOTE_IMAGES;

export default function QuickNoteInput({ workId, sessionId, onSuccess }: QuickNoteInputProps) {
  const [note, setNote] = useState('');
  const [activityType, setActivityType] = useState('');
  const [showActivityPicker, setShowActivityPicker] = useState(false);
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check user permissions for attachment uploads
  const { can, limits } = useUserPermissions();

  const mutation = useMutation({
    mutationFn: async (data: { label?: string; activityType?: string; images: File[] }) => {
      // Create entry first
      const entry = await timelineApi.create({
        timeSessionId: sessionId,
        workId,
        timestamp: new Date().toISOString(),
        label: data.label || undefined,
        activityType: data.activityType || undefined,
      });

      // Upload images if any
      if (data.images.length > 0) {
        // Update pending images status
        setPendingImages(prev => prev.map(img => ({ ...img, status: 'uploading' as const, progress: 0 })));

        await timelineApi.uploadImages(entry.data.id, data.images, (progress) => {
          setPendingImages(prev => prev.map(img => ({ ...img, progress })));
        });
      }

      return entry;
    },
    onSuccess: () => {
      setNote('');
      setActivityType('');
      setPendingImages([]);
      onSuccess();
      inputRef.current?.focus();
    },
    onError: () => {
      // Reset pending images status on error
      setPendingImages(prev => prev.map(img => ({
        ...img,
        status: 'error' as const,
        error: 'Upload failed'
      })));
    },
  });

  const addPendingImages = (files: File[]) => {
    // Check permission first
    if (!can.uploadAttachments) {
      return; // Silently ignore if no permission
    }

    const validFiles = files.filter(file => {
      // Validate with user-specific limits
      const validation = validateImageFile(file, limits.maxImageSize);
      if (!validation.valid) {
        alert(validation.error);
        return false;
      }
      return true;
    });

    const maxImages = limits.maxNoteImages || MAX_IMAGES;
    if (pendingImages.length + validFiles.length > maxImages) {
      alert(FILE_MESSAGES.MAX_IMAGES_REACHED(maxImages));
      return;
    }

    const newPendingImages: PendingImage[] = validFiles.map(file => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      status: 'ready',
      progress: 0,
    }));

    setPendingImages(prev => [...prev, ...newPendingImages]);
  };

  const removePendingImage = (id: string) => {
    setPendingImages(prev => {
      const image = prev.find(img => img.id === id);
      if (image) {
        URL.revokeObjectURL(image.previewUrl);
      }
      return prev.filter(img => img.id !== id);
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      addPendingImages(files);
    }
    // Reset input
    e.target.value = '';
  };

  const handlePaste = (e: ClipboardEvent) => {
    // Only enable paste if user has attachment permission
    if (!can.uploadAttachments) {
      return;
    }

    const items = Array.from(e.clipboardData?.items || []);
    const imageFiles = items
      .filter(item => item.type.startsWith('image/'))
      .map(item => item.getAsFile())
      .filter((file): file is File => file !== null);

    if (imageFiles.length > 0) {
      e.preventDefault();
      addPendingImages(imageFiles);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Require at least note or images
    if (!note.trim() && pendingImages.length === 0) return;

    mutation.mutate({
      label: note.trim() || undefined,
      activityType: activityType || undefined,
      images: pendingImages.map(img => img.file),
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Ctrl/Cmd + Enter to add activity type quickly
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      setShowActivityPicker(!showActivityPicker);
    }
  };

  // Auto-focus on mount and add paste listener
  useEffect(() => {
    inputRef.current?.focus();

    // Add paste listener
    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
      // Cleanup blob URLs
      pendingImages.forEach(img => URL.revokeObjectURL(img.previewUrl));
    };
  }, [pendingImages]);

  return (
    <div className="bg-dark-surface border border-dark-border rounded-lg p-4">
      <div className="flex items-center space-x-2 mb-3">
        <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
        <span className="text-sm text-gray-400 font-medium">Quick Note</span>
        <span className="text-xs text-gray-600">Press Enter to add</span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Pending images preview */}
        {pendingImages.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {pendingImages.map(image => (
              <PendingImagePreview
                key={image.id}
                image={image}
                onRemove={removePendingImage}
              />
            ))}
          </div>
        )}

        <div className="flex space-x-2">
          <input
            ref={inputRef}
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              can.uploadAttachments
                ? "What are you working on right now?"
                : "What are you working on? (add a note)"
            }
            className="input flex-1"
            disabled={mutation.isPending}
          />
          <button
            type="button"
            onClick={() => setShowActivityPicker(!showActivityPicker)}
            className={`btn btn-secondary px-3 ${activityType ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
            title="Set activity type (Ctrl+Enter)"
          >
            <Tag size={16} />
          </button>
          {can.uploadAttachments && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={mutation.isPending || pendingImages.length >= (limits.maxNoteImages || MAX_IMAGES)}
              className="btn btn-secondary px-3"
              title={`Attach images (max ${limits.maxImageSizeFormatted} each)`}
            >
              <Paperclip size={16} />
            </button>
          )}
          <button
            type="submit"
            disabled={(!note.trim() && pendingImages.length === 0) || mutation.isPending}
            className="btn btn-primary px-4"
            title="Add note (Enter)"
          >
            <Send size={16} />
          </button>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />

        {showActivityPicker && (
          <div className="flex flex-wrap gap-2 p-3 bg-dark-bg rounded border border-dark-border">
            <button
              type="button"
              onClick={() => {
                setActivityType('');
                setShowActivityPicker(false);
              }}
              className={`text-xs px-3 py-1.5 rounded transition-colors ${
                !activityType
                  ? 'bg-gray-600 text-white'
                  : 'bg-dark-surface text-gray-400 hover:bg-dark-hover'
              }`}
            >
              None
            </button>
            {ACTIVITY_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => {
                  setActivityType(type);
                  setShowActivityPicker(false);
                  inputRef.current?.focus();
                }}
                className={`text-xs px-3 py-1.5 rounded transition-colors ${
                  activityType === type
                    ? 'bg-blue-600 text-white'
                    : 'bg-dark-surface text-gray-400 hover:bg-dark-hover'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        )}

        {activityType && !showActivityPicker && (
          <div className="flex items-center space-x-2 text-xs">
            <Tag size={12} className="text-blue-400" />
            <span className="text-blue-400">Tagged as: {activityType}</span>
            <button
              type="button"
              onClick={() => setActivityType('')}
              className="text-gray-500 hover:text-gray-300 ml-1"
            >
              ✕
            </button>
          </div>
        )}

        {mutation.isError && (
          <p className="text-red-500 text-xs">Failed to add note. Please try again.</p>
        )}
      </form>

      <div className="mt-3 pt-3 border-t border-dark-border text-xs text-gray-600">
        <span>
          Tip: {can.uploadAttachments && 'Press Ctrl+V to paste screenshots • '}Ctrl+Enter to toggle activity type
          {can.uploadAttachments && ` • Max ${limits.maxImageSizeFormatted} per image`}
        </span>
      </div>
    </div>
  );
}
