import { motion } from 'framer-motion';
import { VoiceChannelOption } from '../types';
import { LogOut, RefreshCw, Radio } from './icons';

interface Props {
  channels: VoiceChannelOption[];
  isLoading: boolean;
  pendingId: string | null;
  isLeaving: boolean;
  currentChannelId: string | null;
  botOnline: boolean;
  onRefresh: () => void;
  onJoin: (channelId: string, label: string) => void;
  onLeave: () => void;
}

export function ChannelsPanel({
  channels,
  isLoading,
  pendingId,
  isLeaving,
  currentChannelId,
  botOnline,
  onRefresh,
  onJoin,
  onLeave,
}: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.4 }}
      className="glass-card p-5 space-y-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radio size={13} className="text-sky-400" />
          <span className="text-xs font-semibold tracking-widest text-white/40 uppercase">Voice Channels</span>
        </div>
        <div className="flex items-center gap-2">
          {currentChannelId && (
            <button
              onClick={onLeave}
              disabled={isLeaving}
              className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 text-red-300 transition-colors disabled:opacity-50"
            >
              <LogOut size={11} /> Leave
            </button>
          )}
          <button
            onClick={onRefresh}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/40 hover:text-white/70 transition-colors"
            title="Refresh channel list"
          >
            <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {!botOnline ? (
        <p className="text-xs text-white/25 italic py-2">Bot is offline — finish Setup to see channels here.</p>
      ) : channels.length === 0 ? (
        <p className="text-xs text-white/25 italic py-2">
          No voice channels found. Make sure the bot has been invited to a server.
        </p>
      ) : (
        <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
          {channels.map((ch) => {
            const active = ch.id === currentChannelId;
            return (
              <button
                key={ch.id}
                onClick={() => onJoin(ch.id, ch.name)}
                disabled={pendingId === ch.id || active}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-left transition-colors ${
                  active
                    ? 'bg-emerald-500/10 border-emerald-500/30'
                    : 'bg-white/4 border-white/8 hover:bg-white/8 hover:border-white/15'
                } disabled:cursor-default`}
              >
                <span className="min-w-0">
                  <span className={`block text-sm truncate ${active ? 'text-emerald-300' : 'text-white/75'}`}>
                    {ch.name}
                  </span>
                  <span className="block text-[10px] text-white/25 truncate">{ch.guildName}</span>
                </span>
                <span
                  className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    active
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : pendingId === ch.id
                      ? 'bg-white/10 text-white/40'
                      : 'bg-violet-500/10 text-violet-300'
                  }`}
                >
                  {active ? 'Connected' : pendingId === ch.id ? '…' : 'Join'}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
