import { motion } from 'framer-motion';
import { TTSConfig } from '../types';
import { OutputDeviceSelect } from './OutputDeviceSelect';

interface Props {
  config: TTSConfig;
  isSaving: boolean;
  onUpdate: (patch: Partial<{ outputDeviceId: string; monitorEnabled: boolean; monitorDeviceId: string }>) => void;
}

export function OutputDevicePanel({ config, isSaving, onUpdate }: Props) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.4 }} className="glass-card p-5 space-y-4">
      <OutputDeviceSelect value={config.outputDeviceId} savedName={config.outputDeviceName}
        disabled={isSaving} onChange={id => onUpdate({ outputDeviceId: id })} />
      {config.outputDeviceId === 'soundpad:microphone' && (
        <div className="space-y-3 pt-1 border-t border-white/8">
          <label className="flex items-center justify-between gap-3 pt-3 cursor-pointer">
            <span>
              <span className="block text-xs font-semibold tracking-widest text-white/40 uppercase">Hear TTS locally</span>
              <span className="block text-[11px] text-white/25 mt-1">Send a copy to headphones or speakers.</span>
            </span>
            <input type="checkbox" checked={config.monitorEnabled} disabled={isSaving}
              onChange={event => onUpdate({ monitorEnabled: event.target.checked })}
              className="w-4 h-4 accent-violet-500" />
          </label>
          {config.monitorEnabled && (
            <OutputDeviceSelect value={config.monitorDeviceId} savedName={config.monitorDeviceName}
              label="Local Monitor Device" selectId="monitor-device-main" windowsOnly disabled={isSaving}
              help="This copy is for you; the microphone route stays unchanged."
              onChange={id => onUpdate({ monitorDeviceId: id })} />
          )}
        </div>
      )}
      <p className="text-[11px] text-white/25">Saved automatically. Changes apply to new messages.</p>
    </motion.div>
  );
}
