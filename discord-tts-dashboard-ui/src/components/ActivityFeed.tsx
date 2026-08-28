import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Activity {
  id: string;
  type: 'sent' | 'repeated' | 'cleared' | 'rate';
  message: string;
  time: Date;
}

interface Props {
  events: Activity[];
}

const typeColors = {
  sent: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  repeated: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  cleared: 'bg-red-500/20 text-red-300 border-red-500/30',
  rate: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
};

const typeIcons = {
  sent: '▶',
  repeated: '↩',
  cleared: '✕',
  rate: '⚡',
};

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ago`;
}

export function ActivityFeed({ events }: Props) {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => forceUpdate((n) => n + 1), 10000);
    return () => clearInterval(interval);
  }, []);

  if (events.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.5 }}
      className="glass-card p-5 space-y-3"
    >
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-violet-400/60" />
        <span className="text-xs font-semibold tracking-widest text-white/35 uppercase">
          Activity
        </span>
      </div>

      <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
        <AnimatePresence initial={false}>
          {events.slice(0, 8).map((event) => (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, x: -10, height: 0 }}
              animate={{ opacity: 1, x: 0, height: 'auto' }}
              exit={{ opacity: 0, x: 10, height: 0 }}
              transition={{ duration: 0.25 }}
              className="flex items-center gap-3"
            >
              <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded border font-mono font-bold ${typeColors[event.type]}`}>
                {typeIcons[event.type]}
              </span>
              <p className="text-xs text-white/50 flex-1 truncate">{event.message}</p>
              <span className="text-[10px] text-white/20 shrink-0">{timeAgo(event.time)}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export type { Activity };
