import { Loader2, Globe } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function LangSwitchOverlay({ t, active }) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="lang-switch-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="fixed inset-0 z-[250] flex flex-col items-center justify-center bg-[var(--bg-primary)]/96 backdrop-blur-md px-6"
          aria-live="polite"
          aria-busy="true"
        >
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.04, duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col items-center text-center max-w-sm"
          >
            <div className="relative mb-6">
              <div className="absolute inset-0 rounded-full bg-[var(--accent)]/20 blur-xl scale-150" />
              <div className="relative w-16 h-16 rounded-2xl border border-[var(--accent)]/30 bg-[var(--bg-surface)] flex items-center justify-center">
                <Globe className="w-8 h-8 text-[var(--accent)]" />
              </div>
            </div>
            <Loader2 className="w-9 h-9 text-[var(--accent)] animate-spin mb-4" />
            <p className="text-lg font-bold text-white mb-1">
              {t.switchingLanguage}
            </p>
            <p className="text-sm text-[var(--text-sec)]">
              {t.reloadingPage}
            </p>
            <div className="lang-switch-progress mt-8 h-1 w-48 rounded-full overflow-hidden bg-[var(--border)]">
              <div className="lang-switch-progress-bar h-full rounded-full bg-[var(--accent)]" />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}