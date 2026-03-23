import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { createToastId, normalizeToastTtl, getToastTiming, getToastVisuals } from './toastUtils';

const ToastContext = createContext();

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', ttl = 3500) => {
    const id = createToastId();
    const t = { id, message, type, ttl: normalizeToastTtl(ttl) };
    setToasts((s) => [t, ...s]);
    return id;
  }, []);

  const removeToast = useCallback((id) => setToasts((s) => s.filter(t => t.id !== id)), []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <div className="fixed right-4 bottom-4 flex flex-col gap-3 z-50">
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} onClose={() => removeToast(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onClose }) {
  const { message, type, ttl = 3500 } = toast;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timing = getToastTiming(ttl);
    // enter
    const enter = setTimeout(() => setVisible(true), timing.enterDelayMs);
    // start hide
    const hide = setTimeout(() => setVisible(false), timing.hideDelayMs);
    // remove after animation
    const remove = setTimeout(() => onClose(), timing.removeDelayMs);
    return () => {
      clearTimeout(enter);
      clearTimeout(hide);
      clearTimeout(remove);
    };
  }, [ttl, onClose]);

  const base = "max-w-sm w-full px-4 py-3 rounded-xl shadow-lg border flex items-start gap-3 items-center";
  const { icon, bgClass } = getToastVisuals(type);

  return (
    <div className={`${base} ${bgClass} transform transition-all duration-300 ease-out ${visible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-2 scale-95'}`}>
      <span className="material-symbols-outlined text-2xl shrink-0 mt-0.5">{icon}</span>
      <div className="flex-1 text-sm font-medium">{message}</div>
      <button onClick={onClose} className="text-slate-400 hover:text-slate-600 ml-2">×</button>
    </div>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export default ToastContext;
