import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { BackgroundOrbs } from './components/BackgroundOrbs';
import { Header } from './components/Header';
import { InputSection } from './components/InputSection';
import { ControlsPanel } from './components/ControlsPanel';
import { StatusPanel } from './components/StatusPanel';
import { ToastContainer } from './components/ToastContainer';
import { ActivityFeed, Activity } from './components/ActivityFeed';
import { OutputDevicePanel } from './components/OutputDevicePanel';
import { SettingsPanel } from './components/SettingsPanel';
import { useStatus } from './hooks/useStatus';
import { useTTS } from './hooks/useTTS';
import { useToast } from './hooks/useToast';
import { useConfig } from './hooks/useConfig';

let activityCounter = 0;

export default function App() {
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [view, setView] = useState<'dashboard' | 'settings'>('dashboard');
  const [hasAutoRedirected, setHasAutoRedirected] = useState(false);

  const { toasts, addToast, removeToast } = useToast();
  const { status, isLoading, refetch } = useStatus(1000);

  const pushActivity = useCallback((type: Activity['type'], message: string) => {
    const id = `act-${++activityCounter}`;
    setActivities((prev) => [{ id, type, message, time: new Date() }, ...prev].slice(0, 10));
  }, []);

  const handleSuccess = useCallback(
    (message: string) => {
      addToast('success', message);
      refetch();
    },
    [addToast, refetch]
  );

  const handleError = useCallback(
    (message: string) => {
      addToast('error', message);
    },
    [addToast]
  );

  const {
    speak,
    repeat,
    clearQueue,
    setRate,
    isSending,
    isRepeating,
    isClearing,
    isSettingRate,
  } = useTTS({
    onSuccess: handleSuccess,
    onError: handleError,
  });

  const { config, isLoading: isConfigLoading, isSaving, save: saveConfig, refetch: refetchConfig } = useConfig({ onError: handleError });

  const lastErrorId = useRef(0);
  useEffect(() => {
    if (status.errorId > lastErrorId.current) {
      lastErrorId.current = status.errorId;
      if (status.error) handleError(status.error);
    }
  }, [status.errorId, status.error, handleError]);

  // First run: send people straight to Setup instead of a dead dashboard.
  useEffect(() => {
    if (!isConfigLoading && !hasAutoRedirected) {
      setHasAutoRedirected(true);
      if (!config.configured) setView('settings');
    }
  }, [isConfigLoading, config.configured, hasAutoRedirected]);

  const handleSend = useCallback(
    async (text: string) => {
      pushActivity('sent', text);
      await speak(text);
    },
    [speak, pushActivity]
  );

  const handleRepeat = useCallback(async () => {
    pushActivity('repeated', 'Repeated last message');
    await repeat();
  }, [repeat, pushActivity]);

  const handleClear = useCallback(async () => {
    pushActivity('cleared', 'Queue cleared');
    await clearQueue();
  }, [clearQueue, pushActivity]);

  const handleRateChange = useCallback(
    async (rate: number) => {
      pushActivity('rate', `Speed set to ${rate > 0 ? '+' : ''}${rate}%`);
      await setRate(rate);
      await refetchConfig();
    },
    [setRate, pushActivity, refetchConfig]
  );

  return (
    <div className="relative min-h-screen bg-[#08080f] text-white overflow-x-hidden">
      <BackgroundOrbs />

      <div className="relative z-10 min-h-screen flex flex-col">
        <div className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 lg:py-12">

          <Header
            isOnline={status.engineStatus === 'online'}
            outputName={status.outputDeviceName}
            onSettingsClick={() => setView((v) => (v === 'settings' ? 'dashboard' : 'settings'))}
          />

          {view === 'settings' ? (
            <SettingsPanel
              config={config}
              isSaving={isSaving}
              onSave={saveConfig}
              onBack={() => setView('dashboard')}
              canGoBack={true}
              onToast={(type, message) => addToast(type, message)}
            />
          ) : (
            /* Dashboard grid */
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-6">

              {/* Left column — main input + controls */}
              <div className="lg:col-span-2 flex flex-col gap-5">
                <InputSection
                  onSend={handleSend}
                  isSending={isSending}
                  autoSpeak={autoSpeak}
                />
                <ControlsPanel
                  initialRate={config.ttsRate}
                  onRepeat={handleRepeat}
                  onClear={handleClear}
                  onRateChange={handleRateChange}
                  autoSpeak={autoSpeak}
                  onAutoSpeakToggle={() => setAutoSpeak((v) => !v)}
                  isRepeating={isRepeating}
                  isClearing={isClearing}
                  isSettingRate={isSettingRate}
                />

                {/* Activity feed — shown on desktop in left col */}
                <div className="hidden lg:block">
                  <ActivityFeed events={activities} />
                </div>
              </div>

              {/* Right column — status + channels */}
              <div className="flex flex-col gap-5">
                <StatusPanel status={status} isLoading={isLoading} />

                <OutputDevicePanel config={config} isSaving={isSaving}
                  onUpdate={async (patch) => {
                    if (await saveConfig(patch)) {
                      handleSuccess('Playback target saved ✓');
                    }
                  }} />

                {/* Activity feed — mobile */}
                <div className="lg:hidden">
                  <ActivityFeed events={activities} />
                </div>

                {/* Footer */}
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.8 }}
                  className="text-center text-[11px] text-white/15 px-2 pb-2"
                >
                  Windows Audio · TTS Control v1.1
                </motion.p>
              </div>
            </div>
          )}
        </div>
      </div>

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
