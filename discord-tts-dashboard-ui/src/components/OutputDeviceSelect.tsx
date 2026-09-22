import { useCallback, useEffect, useState } from 'react';
import { ttsApi } from '../api/ttsApi';
import { OutputDevice } from '../types';
import { RefreshCw } from './icons';

interface Props {
  value: string;
  savedName: string;
  label?: string;
  selectId?: string;
  windowsOnly?: boolean;
  help?: string;
  disabled?: boolean;
  onChange: (id: string) => void;
}

export function OutputDeviceSelect({ value, savedName, label = 'Playback Target', selectId = 'output-device',
  windowsOnly = false, help, disabled, onChange }: Props) {
  const [devices, setDevices] = useState<OutputDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await ttsApi.getDevices();
    if (result.success && result.data) {
      setDevices(result.data);
      setError('');
    } else {
      setError(result.error ?? 'Could not load Windows audio devices');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 5000);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [refresh]);

  const visibleDevices = windowsOnly ? devices.filter(device => device.kind !== 'soundpad') : devices;
  const missing = !!value && !visibleDevices.some(device => device.id === value);
  const unavailable = missing || visibleDevices.find(device => device.id === value)?.available === false;
  const soundpad = value === 'soundpad:microphone';
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={selectId} className="text-xs font-semibold tracking-widest text-white/40 uppercase">{label}</label>
        <button type="button" onClick={refresh} disabled={loading}
          title="Refresh playback targets"
          className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/40 hover:text-white/70 transition-colors">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>
      <select id={selectId} value={value} disabled={disabled}
        onChange={event => onChange(event.target.value)}
        className="w-full min-w-0 bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-sm text-white outline-none focus:border-violet-500/50 disabled:opacity-50">
        <option value="" disabled className="bg-[#0d0d14]">Choose a playback target…</option>
        {missing && <option value={value} disabled className="bg-[#0d0d14]">{savedName || value} — unavailable</option>}
        {visibleDevices.map(device => <option key={device.id} value={device.id} disabled={device.available === false} className="bg-[#0d0d14]">{device.name}{device.available === false ? ' — start Soundpad' : ''}</option>)}
      </select>
      {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
      {!loading && unavailable && <p role="alert" className="text-xs text-amber-300">{soundpad ? 'Start Soundpad to use microphone playback.' : 'Selected device is unavailable. Reconnect it or choose another output.'}</p>}
      {!loading && !devices.length && !error && <p className="text-xs text-white/40">No active Windows output devices found.</p>}
      <p className="text-[11px] text-white/30 leading-relaxed">
        {help ?? (soundpad
          ? 'TTS plays only on the microphone enabled in Soundpad → File → Preferences → Devices. Select that same microphone in Discord. Keep Soundpad running.'
          : 'For your regular microphone choose Soundpad — Microphone. For VB-CABLE choose CABLE Input here and CABLE Output in Discord.')}
      </p>
    </div>
  );
}
