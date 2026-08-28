import { AnimatePresence, motion } from 'framer-motion';
import { Toast } from '../types';
import { CheckCircle, XCircle, Info, X } from './icons';

interface Props {
  toasts: Toast[];
  onRemove: (id: string) => void;
}

const icons = {
  success: <CheckCircle />,
  error: <XCircle />,
  info: <Info />,
};

const colors = {
  success:
    'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  error:
    'border-red-500/40 bg-red-500/10 text-red-300',
  info:
    'border-indigo-500/40 bg-indigo-500/10 text-indigo-300',
};

export function ToastContainer({ toasts, onRemove }: Props) {
  return (
    <div className="fixed top-5 right-5 z-50 flex flex-col gap-3 pointer-events-none">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, x: 80, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 80, scale: 0.85 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-xl shadow-2xl text-sm font-medium min-w-[260px] max-w-[340px] ${colors[toast.type]}`}
          >
            <span className="shrink-0 text-lg">{icons[toast.type]}</span>
            <span className="flex-1">{toast.message}</span>
            <button
              onClick={() => onRemove(toast.id)}
              className="shrink-0 opacity-60 hover:opacity-100 transition-opacity ml-1"
            >
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
