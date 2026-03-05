import React from 'react';
import { AlertCircle } from 'lucide-react';

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={s.page}>
        <div style={s.card}>
          <AlertCircle size={40} color="var(--accent-danger)" />
          <h1 style={s.heading}>Something went wrong</h1>
          <p style={s.message}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            style={s.button}
            onClick={() => window.location.reload()}
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg-mesh)',
    padding: 24,
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
    padding: 40,
    background: 'var(--glass-bg)',
    backdropFilter: 'var(--glass-blur)',
    WebkitBackdropFilter: 'var(--glass-blur)',
    border: '1px solid var(--glass-border)',
    borderRadius: 'var(--radius-lg)',
    maxWidth: 400,
    textAlign: 'center',
  },
  heading: {
    fontSize: 20,
    fontWeight: 700,
    color: 'var(--text-primary)',
    margin: 0,
  },
  message: {
    fontSize: 14,
    color: 'var(--text-secondary)',
    lineHeight: 1.5,
    margin: 0,
  },
  button: {
    padding: '12px 28px',
    background: 'var(--accent-primary)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--radius-pill)',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    marginTop: 8,
  },
};
