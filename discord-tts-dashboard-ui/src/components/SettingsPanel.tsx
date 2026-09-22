import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ttsApi } from '../api/ttsApi';
import { TTSConfig, VoiceOption } from '../types';
import { ArrowLeft } from './icons';
import { OutputDeviceSelect } from './OutputDeviceSelect';

interface Props {
  config: TTSConfig;
  isSaving: boolean;
  onSave: (patch: Partial<{
    outputDeviceId: string;
    monitorEnabled: boolean;
    monitorDeviceId: string;
    ttsVoice: string;
  }>) => Promise<boolean>;
  onBack: () => void;
  canGoBack: boolean;
  onToast: (type: 'success' | 'error', message: string) => void;
}

export function SettingsPanel({ config, isSaving, onSave, onBack, canGoBack, onToast }: Props) {
  const [outputDeviceId, setOutputDeviceId] = useState(config.outputDeviceId);
  const [monitorEnabled, setMonitorEnabled] = useState(config.monitorEnabled);
  const [monitorDeviceId, setMonitorDeviceId] = useState(config.monitorDeviceId);
  const [ttsVoice, setTtsVoice] = useState(config.ttsVoice);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [voiceFilter, setVoiceFilter] = useState('');

  useEffect(() => setOutputDeviceId(config.outputDeviceId), [config.outputDeviceId]);
  useEffect(() => setMonitorEnabled(config.monitorEnabled), [config.monitorEnabled]);
  useEffect(() => setMonitorDeviceId(config.monitorDeviceId), [config.monitorDeviceId]);
  useEffect(() => setTtsVoice(config.ttsVoice), [config.ttsVoice]);

  useEffect(() => {
    ttsApi.getVoices().then((result) => {
      if (result.success && result.data) setVoices(result.data);
    });
  }, []);

  const filteredVoices = useMemo(() => {
    const q = voiceFilter.trim().toLowerCase();
    if (!q) return voices;
    return voices.filter(
      (v) => v.locale.toLowerCase().includes(q) || v.name.toLowerCase().includes(q)
    );
  }, [voices, voiceFilter]);

  const handleSave = async () => {
    const ok = await onSave({
      outputDeviceId,
      monitorEnabled,
      ...(monitorEnabled && outputDeviceId === 'soundpad:microphone' ? { monitorDeviceId } : {}),
      ttsVoice,
    });
    if (ok) onToast('success', 'Settings saved ✓');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="max-w-2xl mx-auto w-full space-y-5"
    >
      <div className="flex items-center gap-3">
        {canGoBack && (
          <button
            onClick={onBack}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white transition-colors"
          >
            <ArrowLeft size={16} />
          </button>
        )}
        <div>
          <h2 className="text-lg font-bold text-white">TTS Settings</h2>
          <p className="text-xs text-white/35">Edge TTS generates speech online. Play through Soundpad or your selected Windows output.</p>
        </div>
      </div>

      {!config.configured && (
        <div className="glass-card p-4 border-amber-500/30 bg-amber-500/5 text-sm text-amber-200/90 space-y-1">
          <p className="font-semibold">First time here?</p>
          <p className="text-amber-200/70">
            Choose Soundpad — Microphone for your regular microphone, or a Windows output device for a virtual cable.
          </p>
        </div>
      )}

      <div className="glass-card p-6 space-y-5">
        <OutputDeviceSelect value={outputDeviceId} savedName={config.outputDeviceName}
          disabled={isSaving} onChange={setOutputDeviceId} />

        {outputDeviceId === 'soundpad:microphone' && (
          <div className="space-y-3 rounded-xl border border-white/8 bg-white/3 p-4">
            <label className="flex items-center justify-between gap-4 cursor-pointer">
              <span>
                <span className="block text-xs font-semibold tracking-widest text-white/40 uppercase">Hear TTS locally</span>
                <span className="block text-[11px] text-white/30 mt-1">Play the same speech in your headphones or speakers.</span>
              </span>
              <input type="checkbox" checked={monitorEnabled} onChange={event => setMonitorEnabled(event.target.checked)}
                className="w-4 h-4 accent-violet-500" />
            </label>
            {monitorEnabled && (
              <OutputDeviceSelect value={monitorDeviceId} savedName={config.monitorDeviceName}
                label="Local Monitor Device" selectId="monitor-device" windowsOnly disabled={isSaving}
                help="Only your local copy goes here. Soundpad still sends TTS to the configured microphone."
                onChange={setMonitorDeviceId} />
            )}
          </div>
        )}

        <div className="space-y-2">
          <label className="text-xs font-semibold tracking-widest text-white/40 uppercase">TTS Voice</label>
          <input
            type="text"
            value={voiceFilter}
            onChange={(e) => setVoiceFilter(e.target.value)}
            placeholder="Filter, e.g. ru-RU, uk-UA, en-US…"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/25 outline-none focus:border-violet-500/50 mb-2"
          />
          <select
            value={ttsVoice}
            onChange={(e) => setTtsVoice(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-violet-500/50"
            size={Math.min(8, Math.max(4, filteredVoices.length || 1))}
          >
            {filteredVoices.length === 0 && <option disabled>Loading voices…</option>}
            {filteredVoices.map((v) => (
              <option key={v.name} value={v.name} className="bg-[#0d0d14]">
                {v.name} — {v.locale}, {v.gender}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={handleSave}
          disabled={isSaving || !outputDeviceId || (outputDeviceId === 'soundpad:microphone' && monitorEnabled && !monitorDeviceId)}
          className="w-full h-12 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm shadow-lg shadow-violet-500/25 transition-all duration-200"
        >
          {isSaving ? 'Saving…' : 'Save Settings'}
        </button>
      </div>

    </motion.div>
  );
}
