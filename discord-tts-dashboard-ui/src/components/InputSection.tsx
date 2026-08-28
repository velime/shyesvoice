import { useState, KeyboardEvent, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send } from './icons';

interface Props {
  onSend: (text: string) => void;
  isSending: boolean;
  autoSpeak: boolean;
}

const AUTO_SPEAK_PAUSE_MS = 1200;

export function InputSection({ onSend, isSending, autoSpeak }: Props) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autoSpeakTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [text]);

  const handleSend = () => {
    if (!text.trim() || isSending) return;
    onSend(text.trim());
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  useEffect(() => {
    if (autoSpeakTimer.current) {
      clearTimeout(autoSpeakTimer.current);
      autoSpeakTimer.current = null;
    }

    if (!autoSpeak || !text.trim() || isSending) return;

    autoSpeakTimer.current = setTimeout(() => {
      onSend(text.trim());
      setText('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }, AUTO_SPEAK_PAUSE_MS);

    return () => {
      if (autoSpeakTimer.current) {
        clearTimeout(autoSpeakTimer.current);
        autoSpeakTimer.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, autoSpeak, isSending]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const charCount = text.length;
  const maxChars = 500;
  const isOverLimit = charCount > maxChars;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className="relative"
    >
      <div className="glass-card p-6 group">
        {/* Label */}
        <div className="flex items-center gap-2 mb-4">
          <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
          <span className="text-xs font-semibold tracking-widest text-white/40 uppercase">
            Text to Speech
          </span>
          {autoSpeak && (
            <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30 font-medium">
              Auto-speak ON
            </span>
          )}
        </div>

        {/* Input area */}
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message here... (Enter to send)"
            rows={3}
            maxLength={maxChars + 50}
            className="w-full resize-none bg-transparent text-white placeholder-white/25 text-lg leading-relaxed outline-none pr-16 pb-8 min-h-[80px] font-light"
          />

          {/* Send button */}
          <AnimatePresence>
            {text.trim().length > 0 && (
              <motion.button
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.7 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                onClick={handleSend}
                disabled={isSending || isOverLimit}
                className="absolute right-0 bottom-6 w-11 h-11 flex items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-violet-500/30 transition-all duration-200 hover:shadow-violet-500/50 hover:scale-105 active:scale-95"
              >
                {isSending ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                    className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                  />
                ) : (
                  <Send size={16} className="text-white" />
                )}
              </motion.button>
            )}
          </AnimatePresence>

          {/* Character counter */}
          <div className="absolute left-0 bottom-0 flex items-center gap-3">
            <span
              className={`text-xs font-mono transition-colors duration-200 ${
                isOverLimit
                  ? 'text-red-400'
                  : charCount > maxChars * 0.8
                  ? 'text-amber-400'
                  : 'text-white/20'
              }`}
            >
              {charCount}/{maxChars}
            </span>
            {text.trim() && (
              <span className="text-xs text-white/20">Shift+Enter for new line</span>
            )}
          </div>
        </div>

        {/* Glow border bottom animation */}
        <motion.div
          className="absolute bottom-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-violet-500/60 to-transparent"
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: text.length > 0 ? 1 : 0, opacity: text.length > 0 ? 1 : 0 }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Large send button for mobile */}
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={handleSend}
        disabled={!text.trim() || isSending || isOverLimit}
        className="mt-3 w-full h-12 flex items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm shadow-lg shadow-violet-500/25 transition-all duration-200 hover:shadow-violet-500/40 sm:hidden"
      >
        {isSending ? (
          <>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
              className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
            />
            Sending...
          </>
        ) : (
          <>
            <Send size={15} />
            Send to Voice Channel
          </>
        )}
      </motion.button>
    </motion.div>
  );
}
