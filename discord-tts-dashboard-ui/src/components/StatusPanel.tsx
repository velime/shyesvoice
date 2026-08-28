import { motion, AnimatePresence } from 'framer-motion';
import { SystemStatus } from '../types';
import { Bot, Wifi, WifiOff, MessageSquare, List } from './icons';

interface Props {
  status: SystemStatus;
  isLoading: boolean;
}

function PulsingDot({ active }: { active: boolean }) {
  return (
    <span className="relative flex h-2.5 w-2.5">
      {active && (
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
      )}
      <span
        className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
          active ? 'bg-emerald-400' : 'bg-red-400/70'
        }`}
      />
    </span>
  );
}

export function StatusPanel({ status, isLoading }: Props) {
  const items = [
    {
      icon: <Bot size={15} />,
      label: 'Bot Status',
      value: status.botStatus === 'online' ? 'Online' : 'Offline',
      active: status.botStatus === 'online',
      color:
        status.botStatus === 'online'
          ? 'text-emerald-400'
          : 'text-red-400',
    },
    {
      icon: status.voiceStatus === 'connected' ? <Wifi size={15} /> : <WifiOff size={15} />,
      label: 'Voice Channel',
      value: status.voiceStatus === 'connected' ? 'Connected' : 'Disconnected',
      active: status.voiceStatus === 'connected',
      color:
        status.voiceStatus === 'connected'
          ? 'text-sky-400'
          : 'text-slate-400',
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="glass-card p-6 space-y-5"
    >
      {/* Section label */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="text-xs font-semibold tracking-widest text-white/40 uppercase">
            System Status
          </span>
        </div>
        {isLoading && (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
            className="w-3.5 h-3.5 border border-white/20 border-t-white/60 rounded-full"
          />
        )}
      </div>

      {/* Status items */}
      <div className="grid grid-cols-2 gap-3">
        {items.map((item, i) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 + i * 0.08 }}
            className="relative rounded-xl p-4 bg-white/4 border border-white/8 overflow-hidden"
          >
            {/* Background glow */}
            <div
              className={`absolute inset-0 opacity-5 ${
                item.active
                  ? i === 0
                    ? 'bg-emerald-500'
                    : 'bg-sky-500'
                  : 'bg-transparent'
              }`}
            />

            <div className="relative flex items-start justify-between gap-2">
              <div className={`mt-0.5 ${item.active ? item.color : 'text-white/30'}`}>
                {item.icon}
              </div>
              <PulsingDot active={item.active} />
            </div>
            <div className="relative mt-3">
              <p className="text-[11px] text-white/35 font-medium uppercase tracking-wider">
                {item.label}
              </p>
              <AnimatePresence mode="wait">
                <motion.p
                  key={item.value}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className={`text-sm font-semibold mt-0.5 ${item.color}`}
                >
                  {item.value}
                </motion.p>
              </AnimatePresence>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Queue size */}
      <div className="flex items-center justify-between px-4 py-3.5 rounded-xl bg-white/4 border border-white/8">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-violet-500/10">
            <List size={14} className="text-violet-400" />
          </div>
          <div>
            <p className="text-[11px] text-white/35 uppercase tracking-wider font-medium">
              Queue Size
            </p>
            <AnimatePresence mode="wait">
              <motion.p
                key={status.queueSize}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.2 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                className="text-xl font-bold text-white tabular-nums"
              >
                {status.queueSize}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>
        <div className="flex items-end gap-0.5 h-8">
          {Array.from({ length: 5 }).map((_, i) => (
            <motion.div
              key={i}
              className="w-1 rounded-full bg-violet-500/40"
              animate={{
                height: status.queueSize > 0
                  ? ['40%', `${30 + Math.random() * 60}%`, '40%']
                  : '15%',
              }}
              transition={{
                repeat: status.queueSize > 0 ? Infinity : 0,
                duration: 0.7 + i * 0.12,
                delay: i * 0.1,
                ease: 'easeInOut',
              }}
            />
          ))}
        </div>
      </div>

      {/* Last message */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <MessageSquare size={12} className="text-white/30" />
          <p className="text-[11px] text-white/35 uppercase tracking-wider font-medium">
            Last Message
          </p>
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={status.lastMessage}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            transition={{ duration: 0.25 }}
            className="relative px-4 py-3 rounded-xl bg-white/4 border border-white/8"
          >
            <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-full bg-gradient-to-b from-violet-500 to-indigo-500 ml-0" style={{ borderRadius: '0 0 0 4px' }} />
            <p className="text-sm text-white/65 font-light leading-relaxed line-clamp-2 pl-1">
              {status.lastMessage || (
                <span className="text-white/25 italic">No messages yet</span>
              )}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
