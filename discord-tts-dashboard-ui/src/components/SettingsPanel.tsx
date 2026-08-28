import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ttsApi } from '../api/ttsApi';
import { BotConfig, VoiceOption } from '../types';
import { ArrowLeft, Copy, ExternalLink, Eye, EyeOff } from './icons';

interface Props {
  config: BotConfig;
  isSaving: boolean;
  onSave: (patch: Partial<{
    discordToken: string;
    targetUserId: string;
    ttsVoice: string;
  }>) => Promise<boolean>;
  onBack: () => void;
  canGoBack: boolean;
  onToast: (type: 'success' | 'error', message: string) => void;
}

export function SettingsPanel({ config, isSaving, onSave, onBack, canGoBack, onToast }: Props) {
  const [token, setToken] = useState(config.discordToken);
  const [targetUserId, setTargetUserId] = useState(config.targetUserId);
  const [ttsVoice, setTtsVoice] = useState(config.ttsVoice);
  const [showToken, setShowToken] = useState(false);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [voiceFilter, setVoiceFilter] = useState('');

  useEffect(() => setToken(config.discordToken), [config.discordToken]);
  useEffect(() => setTargetUserId(config.targetUserId), [config.targetUserId]);
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
      discordToken: token.trim(),
      targetUserId: targetUserId.trim(),
      ttsVoice,
    });
    if (ok) onToast('success', 'Settings saved ✓');
  };

  const copyInvite = async () => {
    if (!config.inviteUrl) return;
    try {
      await navigator.clipboard.writeText(config.inviteUrl);
      onToast('success', 'Invite link copied ✓');
    } catch {
      onToast('error', 'Could not copy — select and copy manually');
    }
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
          <h2 className="text-lg font-bold text-white">Bot Setup</h2>
          <p className="text-xs text-white/35">Everything runs locally — nothing is sent anywhere but your own bot.</p>
        </div>
      </div>

      {!config.configured && (
        <div className="glass-card p-4 border-amber-500/30 bg-amber-500/5 text-sm text-amber-200/90 space-y-1">
          <p className="font-semibold">First time here?</p>
          <p className="text-amber-200/70">
            Create a Discord application at{' '}
            <a
              href="https://discord.com/developers/applications"
              target="_blank"
              rel="noreferrer"
              className="underline decoration-amber-400/50 hover:decoration-amber-300"
            >
              discord.com/developers/applications
            </a>
            , add a Bot, enable the <b>Server Members</b> and <b>Voice States</b> intents, copy its token below, then
            save. See <code className="text-amber-100/90">README.md</code> for the full walkthrough.
          </p>
        </div>
      )}

      <div className="glass-card p-6 space-y-5">
        <div className="space-y-2">
          <label className="text-xs font-semibold tracking-widest text-white/40 uppercase">Discord Bot Token</label>
          <div className="relative">
            <input
              type={showToken ? 'text' : 'password'}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste your bot token"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-11 text-sm text-white placeholder-white/25 outline-none focus:border-violet-500/50 font-mono"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              onClick={() => setShowToken((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
            >
              {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <p className="text-[11px] text-white/30">Never shared — only stored in config.json on this machine.</p>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold tracking-widest text-white/40 uppercase">
            Target User ID <span className="text-white/25 normal-case font-normal">(optional — auto-follow)</span>
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={targetUserId}
            onChange={(e) => setTargetUserId(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="Leave empty to join channels manually instead"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/25 outline-none focus:border-violet-500/50 font-mono"
          />
          <p className="text-[11px] text-white/30">
            When set, the bot auto-joins whenever this Discord user enters a voice channel. Right-click their name in
            Discord (Developer Mode on) → Copy User ID.
          </p>
        </div>

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
          disabled={isSaving || !token.trim()}
          className="w-full h-12 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm shadow-lg shadow-violet-500/25 transition-all duration-200"
        >
          {isSaving ? 'Saving…' : 'Save Settings'}
        </button>
      </div>

      {config.inviteUrl && (
        <div className="glass-card p-5 space-y-3">
          <span className="text-xs font-semibold tracking-widest text-white/40 uppercase">Invite Your Bot</span>
          <p className="text-[11px] text-white/35">
            Only a server's owner (or someone with Manage Server) can use this link. It requests exactly three
            permissions — nothing else:
          </p>
          <ul className="text-[11px] text-white/50 space-y-1 pl-1">
            <li>
              <span className="text-emerald-400 font-semibold">View Channels</span> — see the server's voice channels,
              so you can pick one to join
            </li>
            <li>
              <span className="text-emerald-400 font-semibold">Connect</span> — join a voice channel
            </li>
            <li>
              <span className="text-emerald-400 font-semibold">Speak</span> — play the TTS audio in it
            </li>
          </ul>
          <p className="text-[11px] text-white/30">
            No message access, no server management, no admin rights. Discord's own authorize screen will confirm the
            same three before you approve.
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={config.inviteUrl}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/70 font-mono outline-none"
            />
            <button
              onClick={copyInvite}
              className="shrink-0 p-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white transition-colors"
              title="Copy invite link"
            >
              <Copy size={15} />
            </button>
            <a
              href={config.inviteUrl}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 p-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white transition-colors"
              title="Open invite link"
            >
              <ExternalLink size={15} />
            </a>
          </div>
        </div>
      )}
    </motion.div>
  );
}
