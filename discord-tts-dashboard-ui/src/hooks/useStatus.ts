import { useState, useEffect, useCallback } from 'react';
import { ttsApi } from '../api/ttsApi';
import { SystemStatus } from '../types';

const MOCK_STATUS: SystemStatus = {
  engineStatus: 'offline',
  outputStatus: 'unavailable',
  outputDeviceId: '',
  outputDeviceName: '',
  playbackStatus: 'idle',
  activeDeviceId: '',
  error: '',
  errorId: 0,
  completedCount: 0,
  queueSize: 0,
  lastMessage: '',
};

export function useStatus(pollInterval = 5000) {
  const [status, setStatus] = useState<SystemStatus>(MOCK_STATUS);
  const [isLoading, setIsLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    const result = await ttsApi.getStatus();
    if (result.success && result.data) {
      setStatus(result.data);
    } else {
      setStatus(previous => ({ ...previous, engineStatus: 'offline', error: result.error ?? 'API unavailable' }));
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
