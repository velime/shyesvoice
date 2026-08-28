import { useState, useCallback } from 'react';
import { ttsApi } from '../api/ttsApi';

interface UseTTSOptions {
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

export function useTTS({ onSuccess, onError }: UseTTSOptions) {
  const [isSending, setIsSending] = useState(false);
  const [isRepeating, setIsRepeating] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isSettingRate, setIsSettingRate] = useState(false);

  const speak = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      setIsSending(true);
      const result = await ttsApi.speak(text);
      if (result.success) {
        onSuccess('Message sent to voice channel ✓');
      } else {
        onError(`Failed to send: ${result.error ?? 'Unknown error'}`);
      }
      setIsSending(false);
    },
    [onSuccess, onError]
  );

  const repeat = useCallback(async () => {
    setIsRepeating(true);
    const result = await ttsApi.repeat();
    if (result.success) {
      onSuccess('Last message repeated ↩');
    } else {
      onError(`Failed to repeat: ${result.error ?? 'Unknown error'}`);
    }
    setIsRepeating(false);
  }, [onSuccess, onError]);

  const clearQueue = useCallback(async () => {
    setIsClearing(true);
    const result = await ttsApi.clearQueue();
    if (result.success) {
      onSuccess('Queue cleared ✓');
    } else {
      onError(`Failed to clear queue: ${result.error ?? 'Unknown error'}`);
    }
    setIsClearing(false);
  }, [onSuccess, onError]);

  const setRate = useCallback(
    async (rate: number) => {
      setIsSettingRate(true);
      const result = await ttsApi.setRate(rate);
      if (result.success) {
        onSuccess(`Speech rate set to ${rate > 0 ? '+' : ''}${rate}% ✓`);
      } else {
        onError(`Failed to set rate: ${result.error ?? 'Unknown error'}`);
      }
      setIsSettingRate(false);
    },
    [onSuccess, onError]
  );

  return {
    speak,
    repeat,
    clearQueue,
    setRate,
    isSending,
    isRepeating,
    isClearing,
    isSettingRate,
  };
}
