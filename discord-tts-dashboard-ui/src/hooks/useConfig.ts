import { useCallback, useEffect, useState } from 'react';
import { ttsApi } from '../api/ttsApi';
import { TTSConfig } from '../types';

const EMPTY_CONFIG: TTSConfig = {
  configured: false,
  outputDeviceId: '',
  outputDeviceName: '',
  monitorEnabled: true,
  monitorDeviceId: '',
  monitorDeviceName: '',
  ttsVoice: 'uk-UA-OstapNeural',
  ttsRate: 0,
};

interface UseConfigOptions {
  onError?: (message: string) => void;
}

export function useConfig({ onError }: UseConfigOptions = {}) {
  const [config, setConfig] = useState<TTSConfig>(EMPTY_CONFIG);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const refetch = useCallback(async () => {
    const result = await ttsApi.getConfig();
    if (result.success && result.data) {
      setConfig(result.data);
    }
    setIsLoading(false);
    return result;
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const save = useCallback(
    async (patch: Partial<{
      outputDeviceId: string;
      monitorEnabled: boolean;
      monitorDeviceId: string;
      ttsVoice: string;
      ttsRate: number;
    }>) => {
      setIsSaving(true);
      const result = await ttsApi.saveConfig(patch);
      if (result.success) {
        await refetch();
      } else if (onError) {
        onError(result.error ?? 'Failed to save settings');
      }
      setIsSaving(false);
      return result.success;
    },
    [refetch, onError]
  );

  return { config, isLoading, isSaving, save, refetch };
}
