import { WifiOff, RefreshCw } from 'lucide-react';
import { useUnifiedStreamContext } from '../hooks/useUnifiedStream';

/**
 * Connection Status Indicator
 * Shows a subtle banner when disconnected or reconnecting
 * Hidden when connected (normal state) or on initial connection (null)
 */
export default function ConnectionStatus() {
  const { connectionStatus } = useUnifiedStreamContext();

  // Hide on initial connection (null) or when connected
  if (connectionStatus === 'connected' || connectionStatus === null) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 pointer-events-none">
      {connectionStatus === 'disconnected' && (
        <div className="bg-red-600 text-white px-4 py-2 text-sm text-center shadow-lg flex items-center justify-center gap-2">
          <WifiOff size={16} />
          <span>Connection lost. Reconnecting...</span>
        </div>
      )}
      {connectionStatus === 'reconnecting' && (
        <div className="bg-yellow-600 text-white px-4 py-2 text-sm text-center shadow-lg flex items-center justify-center gap-2">
          <RefreshCw size={16} className="animate-spin" />
          <span>Reconnecting to server...</span>
        </div>
      )}
    </div>
  );
}
