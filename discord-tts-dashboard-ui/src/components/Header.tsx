import { motion } from 'framer-motion';
import { Settings } from './icons';

interface Props {
  isOnline: boolean;
  botUsername?: string;
  onSettingsClick: () => void;
}

export function Header({ isOnline, botUsername, onSettingsClick }: Props) {
  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex items-center justify-between mb-10"
    >
      <div className="flex items-center gap-4">
        {/* Logo mark */}
        <div className="relative">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center shadow-lg shadow-violet-500/30">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-white">
              <path
                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"
                fill="currentColor"
                opacity="0.3"
              />
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill="currentColor" />
            </svg>
          </div>
          {isOnline && (
            <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-400 border-2 border-[#0d0d14]" />
            </span>
          )}
        </div>

        <div>
          <h1 className="text-xl font-bold text-white tracking-tight leading-none">
            TTS Control
          </h1>
          <p className="text-xs text-white/35 mt-0.5 font-medium">
            {botUsername || 'Discord Voice Bridge'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Status badge */}
        <motion.div
          animate={isOnline ? { scale: [1, 1.03, 1] } : {}}
          transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-full border text-xs font-semibold backdrop-blur-md ${
            isOnline
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-red-500/10 border-red-500/30 text-red-400'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
          {isOnline ? 'System Online' : 'System Offline'}
        </motion.div>

        <button
          onClick={onSettingsClick}
          className="p-2.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white/50 hover:text-white transition-colors"
          title="Bot Setup"
        >
          <Settings size={16} />
        </button>
      </div>
    </motion.header>
  );
}
