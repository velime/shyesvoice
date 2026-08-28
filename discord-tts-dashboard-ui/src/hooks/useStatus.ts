import { useState, useEffect, useCallback } from 'react';
import { ttsApi } from '../api/ttsApi';
import { SystemStatus } from '../types';

const MOCK_STATUS: SystemStatus = {
  botStatus: 'offline',
  botUsername: '',
  voiceStatus: 'disconnected',
  voiceChannelId: null,
  queueSize: 0,
  lastMessage: '',
};

export function useStatus(pollInterval = 5000) {
  const [status, setStatus] = useState<SystemStatus>(MOCK_STATUS);
  const [isLoading, setIsLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    const result = await ttsApi.getStatus();
    if (result.success && result.data) {
      setStatus({
        botStatus: result.data.botStatus,
        botUsername: result.data.botUsername,
        voiceStatus: result.data.voiceStatus,
        voiceChannelId: result.data.voiceChannelId,
        queueSize: result.data.queueSize,
        lastMessage: result.data.lastMessage,
      });
    } else {
      // Use mock/last known status on failure
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, pollInterval);
    return () => clearInterval(interval);
  }, [fetchStatus, pollInterval]);

  return { status, isLoading, refetch: fetchStatus };
}
