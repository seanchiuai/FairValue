import React from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface QRCardProps {
  joinUrl: string;
  ngrokUrl: string;
  onNgrokChange: (url: string) => void;
}

export default function QRCard({ joinUrl, ngrokUrl, onNgrokChange }: QRCardProps) {
  return (
    <div style={s.card}>
      <div style={s.title}>Scan to Join</div>
      <div style={s.qrWrapper}>
        <QRCodeSVG
          value={joinUrl}
          size={160}
          bgColor="#FFFFFF"
          fgColor="#000000"
          style={{ borderRadius: 8, padding: 8 }}
        />
      </div>
      <div style={s.url}>{joinUrl}</div>
      <div style={s.ngrokField}>
        <label style={s.ngrokLabel}>Ngrok / Public URL</label>
        <input
          style={s.ngrokInput}
          value={ngrokUrl}
          onChange={(e) => onNgrokChange(e.target.value)}
          placeholder="https://abcd-1234.ngrok-free.app"
        />
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  card: {
    padding: 20,
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 10,
    textAlign: 'center',
  },
  title: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  qrWrapper: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: 10,
  },
  url: {
    fontSize: 11,
    color: 'var(--text-muted)',
    wordBreak: 'break-all',
  },
  ngrokField: {
    marginTop: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  ngrokLabel: {
    fontSize: 10,
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  ngrokInput: {
    padding: '8px 10px',
    background: 'var(--bg-input)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 6,
    color: 'var(--text-primary)',
    fontSize: 12,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
};
