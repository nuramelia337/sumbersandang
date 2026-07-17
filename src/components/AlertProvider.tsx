import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle, Info, X, XCircle } from 'lucide-react';

type AlertVariant = 'info' | 'success' | 'warning' | 'error';

interface AlertState {
  title: string;
  message?: string;
  variant: AlertVariant;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void | Promise<void>;
  showCancel?: boolean;
}

interface AlertContextValue {
  showAlert: (options: Omit<AlertState, 'showCancel'>) => void;
  showConfirm: (options: Omit<AlertState, 'showCancel'>) => void;
}

const AlertContext = createContext<AlertContextValue | null>(null);

const VARIANT_STYLES: Record<AlertVariant, { icon: any; color: string; bg: string }> = {
  info: { icon: Info, color: 'text-primary-600', bg: 'bg-primary-50 dark:bg-primary-900/20' },
  success: { icon: CheckCircle, color: 'text-success-600', bg: 'bg-success-50 dark:bg-success-900/20' },
  warning: { icon: AlertCircle, color: 'text-warning-600', bg: 'bg-warning-50 dark:bg-warning-900/20' },
  error: { icon: XCircle, color: 'text-error-600', bg: 'bg-error-50 dark:bg-error-900/20' },
};

export function AlertProvider({ children }: { children: ReactNode }) {
  const [alert, setAlert] = useState<AlertState | null>(null);
  const [working, setWorking] = useState(false);

  const showAlert = useCallback((options: Omit<AlertState, 'showCancel'>) => {
    setAlert({ confirmLabel: 'OK', ...options, variant: options.variant || 'info', showCancel: false });
  }, []);

  const showConfirm = useCallback((options: Omit<AlertState, 'showCancel'>) => {
    setAlert({ confirmLabel: 'Ya', cancelLabel: 'Batal', ...options, variant: options.variant || 'warning', showCancel: true });
  }, []);

  const value = useMemo(() => ({ showAlert, showConfirm }), [showAlert, showConfirm]);
  const style = alert ? VARIANT_STYLES[alert.variant] : null;
  const Icon = style?.icon;

  const close = () => {
    if (!working) setAlert(null);
  };

  const confirm = async () => {
    if (!alert) return;
    setWorking(true);
    try {
      await alert.onConfirm?.();
      setAlert(null);
    } finally {
      setWorking(false);
    }
  };

  return (
    <AlertContext.Provider value={value}>
      {children}
      {alert && style && Icon && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={close}>
          <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-5 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-4">
              <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full ${style.bg} ${style.color}`}>
                <Icon size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-serif text-lg font-bold text-neutral-900 dark:text-neutral-50">{alert.title}</h2>
                  <button onClick={close} disabled={working} className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-50 dark:hover:bg-neutral-800 dark:hover:text-neutral-200">
                    <X size={18} />
                  </button>
                </div>
                {alert.message && <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">{alert.message}</p>}
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              {alert.showCancel && (
                <button onClick={close} disabled={working} className="btn-secondary px-4 py-2">
                  {alert.cancelLabel || 'Batal'}
                </button>
              )}
              <button onClick={confirm} disabled={working} className={alert.variant === 'error' ? 'inline-flex items-center justify-center gap-2 rounded-full bg-error-600 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-error-700 disabled:opacity-50' : 'btn-primary px-5 py-2.5'}>
                {working ? 'Memproses...' : alert.confirmLabel || 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AlertContext.Provider>
  );
}

export function useAlert() {
  const ctx = useContext(AlertContext);
  if (!ctx) throw new Error('useAlert must be used inside AlertProvider');
  return ctx;
}
