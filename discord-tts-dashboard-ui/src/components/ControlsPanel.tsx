import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, Trash2, Volume2, Zap } from './icons';

interface Props {
  onRepeat: () => void;
  onClear: () => void;
  onRateChange: (rate: number) => void;
  autoSpeak: boolean;
  onAutoSpeakToggle: () => void;
  isRepeating: boolean;
  isClearing: boolean;
  isSettingRate: boolean;
}

export function ControlsPanel({
  onRepeat,
  onClear,
  onRateChange,
  autoSpeak,
  onAutoSpeakToggle,
  isRepeating,
  isClearing,
  isSettingRate,
}: Props) {
  const [rate, setRate] = useState(0);
  const [pendingRate, setPendingRate] = useState(false);

  useEffect(() => {
    if (!pendingRate) return;
    const timer = setTimeout(() => {
      onRateChange(rate);
      setPendingRate(false);
    }, 600);
    return () => clearTimeout(timer);
  }, [rate, pendingRate, onRateChange]);

  const handleRateChange = (value: number) => {
    setRate(value);
    setPendingRate(true);
  };

  const rateLabel = rate === 0 ? 'Normal' : rate > 0 ? `+${rate}%` : `${rate}%`;

  const sliderPercent = ((rate + 50) / 100) * 100;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="glass-card p-6 space-y-6"
    >
      {/* Section label */}
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-indigo-400" />
        <span className="text-xs font-semibold tracking-widest text-white/40 uppercase">
          Controls
        </span>
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-3">
        {/* Repeat */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={onRepeat}
          disabled={isRepeating}
          className="relative flex items-center justify-center gap-2.5 h-12 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-indigo-500/40 text-white/70 hover:text-white text-sm font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden group"
        >
          <span className="absolute inset-0 bg-gradient-to-r from-indigo-600/0 to-indigo-600/0 group-hover:from-indigo-600/10 group-hover:to-violet-600/10 transition-all duration-300" />
          {isRepeating ? (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
              className="w-4 h-4 border-2 border-white/20 border-t-indigo-400 rounded-full"
            />
          ) : (
            <RefreshCw size={15} />
          )}
          <span>Repeat</span>
        </motion.button>

        {/* Clear Queue */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={onClear}
          disabled={isClearing}
          className="relative flex items-center justify-center gap-2.5 h-12 rounded-xl bg-white/5 hover:bg-red-500/10 border border-white/10 hover:border-red-500/40 text-white/70 hover:text-red-300 text-sm font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden group"
        >
          <span className="absolute inset-0 bg-gradient-to-r from-red-600/0 to-red-600/0 group-hover:from-red-600/5 group-hover:to-red-600/5 transition-all duration-300" />
          {isClearing ? (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
              className="w-4 h-4 border-2 border-white/20 border-t-red-400 rounded-full"
            />
          ) : (
            <Trash2 size={15} />
          )}
          <span>Clear Queue</span>
        </motion.button>
      </div>

      {/* Speech Speed Slider */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-white/60">
            <Volume2 size={14} />
            <span>Speech Speed</span>
          </div>
          <div className="flex items-center gap-2">
            {(pendingRate || isSettingRate) && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="w-3 h-3 border border-violet-400/40 border-t-violet-400 rounded-full animate-spin"
              />
            )}
            <span
              className={`text-sm font-mono font-semibold min-w-[52px] text-right transition-colors duration-200 ${
                rate === 0 ? 'text-white/50' : rate > 0 ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              {rateLabel}
            </span>
          </div>
        </div>

        <div className="relative">
          {/* Track background */}
          <div className="relative h-2 rounded-full bg-white/8 overflow-hidden">
            <motion.div
              className="absolute top-0 h-full rounded-full bg-gradient-to-r from-violet-600 to-indigo-500"
              style={{ width: `${sliderPercent}%` }}
              transition={{ duration: 0.1 }}
            />
          </div>
          <input
            type="range"
            min={-50}
            max={50}
            step={5}
            value={rate}
            onChange={(e) => handleRateChange(Number(e.target.value))}
            className="absolute inset-0 w-full opacity-0 cursor-pointer h-2"
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white shadow-lg shadow-violet-500/40 border-2 border-violet-500 transition-all duration-100 pointer-events-none"
            style={{ left: `calc(${sliderPercent}% - 8px)` }}
          />
        </div>

        {/* Labels */}
        <div className="flex justify-between text-[10px] text-white/25 font-mono px-1">
          <span>-50%</span>
          <span>Normal</span>
          <span>+50%</span>
        </div>

        {/* Snap buttons */}
        <div className="flex gap-2">
          {[-50, -25, 0, 25, 50].map((snap) => (
            <button
              key={snap}
              onClick={() => handleRateChange(snap)}
              className={`flex-1 h-7 rounded-lg text-[10px] font-semibold transition-all duration-200 border ${
                rate === snap
                  ? 'bg-violet-500/20 border-violet-500/50 text-violet-300'
                  : 'bg-white/4 border-white/8 text-white/30 hover:text-white/60 hover:bg-white/8'
              }`}
            >
              {snap > 0 ? `+${snap}` : snap === 0 ? '↺' : snap}
            </button>
          ))}
        </div>
      </div>

      {/* Auto Speak Toggle */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2.5">
          <div className={`p-1.5 rounded-lg transition-colors duration-200 ${autoSpeak ? 'bg-violet-500/20' : 'bg-white/5'}`}>
            <Zap size={13} className={autoSpeak ? 'text-violet-400' : 'text-white/40'} />
          </div>
          <div>
            <p className="text-sm text-white/80 font-medium">Auto Speak</p>
            <p className="text-[11px] text-white/30">Send on every keystroke pause</p>
          </div>
        </div>

        <button
          onClick={onAutoSpeakToggle}
          className={`relative w-11 h-6 rounded-full transition-all duration-300 ${
            autoSpeak ? 'bg-gradient-to-r from-violet-600 to-indigo-600' : 'bg-white/10'
          }`}
        >
          <motion.div
            className="absolute top-1 w-4 h-4 rounded-full bg-white shadow-md"
            animate={{ left: autoSpeak ? '24px' : '4px' }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          />
        </button>
      </div>
    </motion.div>
  );
}
