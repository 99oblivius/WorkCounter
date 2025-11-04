import { useZippingQueue } from '../stores/zippingQueueStore';
import { Loader2, FolderArchive, CheckCircle, XCircle, X } from 'lucide-react';

export default function ZippingNotification() {
  const { zippings, removeZipping, setCancelled } = useZippingQueue();

  const zippingArray = Array.from(zippings.values());

  if (zippingArray.length === 0) return null;

  return (
    <div className="space-y-2 mb-4">
      {zippingArray.map((zipping) => (
        <ZippingItem
          key={zipping.id}
          zipping={zipping}
          onCancel={() => setCancelled(zipping.id)}
          onRemove={() => removeZipping(zipping.id)}
        />
      ))}
    </div>
  );
}

interface ZippingItemProps {
  zipping: any;
  onCancel: () => void;
  onRemove: () => void;
}

function ZippingItem({ zipping, onCancel, onRemove }: ZippingItemProps) {
  const isScanning = zipping.status === 'scanning';
  const isZipping = zipping.status === 'zipping';
  const isCompleted = zipping.status === 'completed';
  const isFailed = zipping.status === 'failed';
  const isCancelled = zipping.status === 'cancelled';

  const getStatusIcon = () => {
    if (isScanning) return <Loader2 className="animate-spin text-blue-400" size={16} />;
    if (isZipping) return <FolderArchive className="text-blue-400" size={16} />;
    if (isCompleted) return <CheckCircle className="text-green-400" size={16} />;
    if (isFailed) return <XCircle className="text-red-400" size={16} />;
    if (isCancelled) return <XCircle className="text-gray-400" size={16} />;
    return null;
  };

  const getStatusText = () => {
    if (isScanning) return `Scanning folder "${zipping.folderName}"...`;
    if (isZipping) {
      const progress = Math.round((zipping.filesProcessed / zipping.totalFiles) * 100);
      return `Zipping ${zipping.folderName} (${progress}%)`;
    }
    if (isCompleted) return `${zipping.folderName}.zip ready`;
    if (isFailed) return `Failed to zip ${zipping.folderName}`;
    if (isCancelled) return `Cancelled ${zipping.folderName}`;
    return '';
  };

  const getProgressDetails = () => {
    if (isScanning) return 'Discovering files...';
    if (isZipping) {
      return `${zipping.filesProcessed} of ${zipping.totalFiles} files`;
    }
    if (isCompleted) return 'Starting upload...';
    if (isFailed && zipping.error) return zipping.error;
    if (isCancelled) return 'Zipping cancelled';
    return '';
  };

  const progress = isZipping
    ? Math.round((zipping.filesProcessed / zipping.totalFiles) * 100)
    : 0;

  return (
    <div className="w-full bg-blue-900 bg-opacity-10 border border-blue-500 border-opacity-30 hover:border-opacity-50 rounded p-3 text-xs transition-colors">
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0 mt-0.5">{getStatusIcon()}</div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <p className="text-blue-300 truncate font-medium">{getStatusText()}</p>

            <div className="flex items-center space-x-2 ml-2 flex-shrink-0">
              {(isScanning || isZipping) && (
                <>
                  {isZipping && (
                    <span className="text-blue-400">
                      {progress}%
                    </span>
                  )}
                  <button
                    onClick={onCancel}
                    className="p-1 hover:bg-dark-hover rounded text-blue-400 hover:text-red-400"
                    title="Cancel"
                  >
                    <X size={14} />
                  </button>
                </>
              )}

              {(isFailed || isCancelled) && (
                <button
                  onClick={onRemove}
                  className="p-1 hover:bg-dark-hover rounded text-gray-400 hover:text-red-400"
                  title="Remove"
                >
                  <X size={14} />
                </button>
              )}

              {isCompleted && (
                <span className="text-green-400 text-xs">✓ Ready</span>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2 text-blue-400 text-opacity-70">
            <span>{getProgressDetails()}</span>
            {isZipping && zipping.currentFile && (
              <>
                <span>•</span>
                <span className="truncate">{zipping.currentFile}</span>
              </>
            )}
          </div>

          {(isScanning || isZipping) && (
            <div className="mt-2">
              <div className="w-full bg-dark-surface rounded-full h-1">
                <div
                  className="h-1 rounded-full transition-all duration-300 bg-blue-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
