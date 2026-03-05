import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

export type ToastType = 'error' | 'success' | 'info';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
}

interface ToastContextValue {
  toasts: Toast[];
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATIONS: Record<ToastType, number> = {
  success: 4000,
  info: 4000,
  error: 6000,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismissToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', duration?: number) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const dur = duration ?? DEFAULT_DURATIONS[type];
      const toast: Toast = { id, message, type, duration: dur };

      setToasts((prev) => [...prev.slice(-4), toast]); // max 5 visible

      const timer = setTimeout(() => {
        dismissToast(id);
      }, dur);
      timersRef.current.set(id, timer);
    },
    [dismissToast]
  );

  return (
    <ToastContext.Provider value={{ toasts, showToast, dismissToast }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}
