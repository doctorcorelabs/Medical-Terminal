import { useEffect } from 'react';

const VARIANT_STYLES = {
  info: {
    icon: 'info',
    badge: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300',
    accent: 'from-blue-500/15 to-cyan-500/15 dark:from-blue-500/20 dark:to-cyan-500/20',
    primaryBtn: 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/25',
  },
  success: {
    icon: 'check_circle',
    badge: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300',
    accent: 'from-emerald-500/15 to-teal-500/15 dark:from-emerald-500/20 dark:to-teal-500/20',
    primaryBtn: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/25',
  },
  warning: {
    icon: 'warning',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    accent: 'from-amber-500/15 to-orange-500/15 dark:from-amber-500/20 dark:to-orange-500/20',
    primaryBtn: 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/25',
  },
  error: {
    icon: 'error',
    badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
    accent: 'from-rose-500/15 to-red-500/15 dark:from-rose-500/20 dark:to-red-500/20',
    primaryBtn: 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/25',
  },
};

export default function ImportWindowBox({
  open,
  variant = 'info',
  title,
  message,
  highlights = [],
  primaryLabel = 'OK',
  secondaryLabel,
  onPrimary,
  onSecondary,
  onClose,
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const styles = VARIANT_STYLES[variant] || VARIANT_STYLES.info;

  return (
    <div className="fixed inset-0 z-70 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full sm:max-w-xl max-h-[90dvh] sm:max-h-[85dvh] bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden animate-[fadeIn_0.2s_ease-out]">
        <div className={`absolute inset-x-0 top-0 h-24 bg-linear-to-r ${styles.accent}`} />

        <div className="relative px-4 sm:px-6 pt-5 pb-4 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`size-11 rounded-2xl flex items-center justify-center shadow-sm ${styles.badge}`}>
              <span className="material-symbols-outlined text-[24px]">{styles.icon}</span>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Status Impor JSON</p>
              <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white mt-1 leading-snug">{title}</h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 size-8 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Tutup"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        <div className="px-4 sm:px-6 py-4 sm:py-5 overflow-y-auto space-y-4">
          {message && (
            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{message}</p>
          )}

          {highlights.length > 0 && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/60 p-3.5 sm:p-4 space-y-2">
              {highlights.map((item, index) => (
                <div key={`${item}-${index}`} className="flex items-start gap-2.5">
                  <span className="material-symbols-outlined text-[16px] text-slate-400 mt-0.5">subdirectory_arrow_right</span>
                  <p className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 leading-relaxed">{item}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-4 sm:px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5">
          {secondaryLabel && (
            <button
              onClick={onSecondary || onClose}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              {secondaryLabel}
            </button>
          )}
          <button
            onClick={onPrimary || onClose}
            className={`w-full sm:w-auto px-5 py-2.5 rounded-xl text-sm font-black shadow-lg transition-all active:scale-95 ${styles.primaryBtn}`}
          >
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
