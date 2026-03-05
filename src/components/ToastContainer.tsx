import React from 'react';
import { useToast, type Toast, type ToastType } from '../contexts/ToastContext';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 size={16} color="var(--accent-success)" />,
  error: <AlertCircle size={16} color="var(--accent-danger)" />,
  info: <Info size={16} color="var(--accent-primary)" />,
};

const BG_COLORS: Record<ToastType, string> = {
  success: 'rgba(52, 199, 89, 0.08)',
  error: 'rgba(255, 59, 48, 0.08)',
  info: 'rgba(0, 122, 255, 0.08)',
};

const BORDER_COLORS: Record<ToastType, string> = {
  success: 'rgba(52, 199, 89, 0.25)',
  error: 'rgba(255, 59, 48, 0.25)',
  info: 'rgba(0, 122, 255, 0.25)',
};

export default function ToastContainer() {
  const { toasts, dismissToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div style={s.container}>
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={dismissToast} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  return (
    <div
      style={{
        ...s.toast,
        background: BG_COLORS[toast.type],
        borderColor: BORDER_COLORS[toast.type],
      }}
      role="alert"
    >
      <span style={s.icon}>{ICONS[toast.type]}</span>
      <span style={s.message}>{toast.message}</span>
      <button
        style={s.dismiss}
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
      >
        <X size={14} />
      </button>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    top: 16,
    right: 16,
    zIndex: 9999,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    maxWidth: 380,
    width: '100%',
    pointerEvents: 'none',
  },
  toast: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '12px 14px',
    borderRadius: 12,
    border: '1px solid',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
    pointerEvents: 'auto',
    animation: 'toastSlideIn 0.25s ease-out',
  },
  icon: {
    flexShrink: 0,
    display: 'flex',
  },
  message: {
    flex: 1,
    fontSize: 13,
    lineHeight: 1.4,
    color: 'var(--text-primary)',
  },
  dismiss: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 24,
    height: 24,
    border: 'none',
    background: 'transparent',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    borderRadius: 6,
    padding: 0,
  },
};
