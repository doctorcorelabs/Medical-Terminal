import { useEffect, useRef, useState } from 'react';

export default function ConfirmDialog({
  open,
  title = 'Konfirmasi',
  message = '',
  confirmLabel = 'Yes',
  cancelLabel = 'Cancel',
  onConfirm = () => {},
  onCancel = () => {},
  requireTypedConfirmation = null, // string the user must type exactly to enable confirm
  danger = false, // true → red confirm button + warning icon header
}) {
  const inputRef = useRef(null);
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (open) {
      setTyped('');
      setTimeout(() => {
        if (requireTypedConfirmation && inputRef.current) inputRef.current.focus();
      }, 50);
    }
  }, [open, requireTypedConfirmation]);

  useEffect(() => {
    const onKey = (e) => {
      if (!open) return;
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const allowConfirm = requireTypedConfirmation ? typed === requireTypedConfirmation : true;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="relative w-full max-w-lg mx-4 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 p-6"
      >
        {danger && (
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 mb-4">
            <span className="material-symbols-outlined text-2xl text-red-500">warning</span>
          </div>
        )}
        <h3 id="confirm-title" className={`font-bold text-lg ${danger ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'}`}>{title}</h3>
        {message && <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">{message}</p>}

        {requireTypedConfirmation && (
          <div className="mt-4">
            <p className="text-xs text-slate-500 mb-2">Ketik <span className="font-semibold">{requireTypedConfirmation}</span> untuk mengonfirmasi.</p>
            <input
              ref={inputRef}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
              placeholder={requireTypedConfirmation}
            />
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm hover:bg-slate-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={!allowConfirm}
            className={`px-4 py-2 rounded-lg text-white text-sm font-semibold ${
              !allowConfirm
                ? 'bg-slate-300 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
                : danger
                ? 'bg-red-500 hover:bg-red-600'
                : 'bg-primary hover:bg-blue-600'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
