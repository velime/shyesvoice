import { useCallback, useEffect, useState } from 'react';
import { ttsApi } from '../api/ttsApi';
import { VoiceChannelOption } from '../types';

interface UseChannelsOptions {
  onError?: (message: string) => void;
  onSuccess?: (message: string) => void;
}

export function useChannels({ onError, onSuccess }: UseChannelsOptions = {}) {
  const [channels, setChannels] = useState<VoiceChannelOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    const result = await ttsApi.getChannels();
    if (result.success && result.data) {
      setChannels(result.data);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const join = useCallback(
    async (channelId: string, label: string) => {
      setPendingId(channelId);
      const result = await ttsApi.joinChannel(channelId);
      if (result.success) {
        onSuccess?.(`Joined “${label}” ✓`);
      } else {
        onError?.(result.error ?? 'Failed to join channel');
      }
      setPendingId(null);
      return result.success;
    },
    [onError, onSuccess]
  );

  const leave = useCallback(async () => {
    setIsLeaving(true);
    const result = await ttsApi.leaveChannel();
    if (result.success) {
      onSuccess?.('Left the voice channel');
    } else {
      onError?.(result.error ?? 'Failed to leave channel');
    }
    setIsLeaving(false);
    return result.success;
  }, [onError, onSuccess]);

  return { channels, isLoading, pendingId, isLeaving, refetch, join, leave };
}
