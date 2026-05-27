import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Clipboard, Download } from 'lucide-react';
import './RoomArtifact.css';

export type RoomArtifactStatusTone = 'live' | 'ready' | 'settled';

export interface RoomArtifactEvidenceItem {
  label: string;
  value: string;
  detail: string;
}

export interface RoomArtifactMetric {
  label: string;
  value: string;
  detail: string;
}

export interface RoomArtifactTimelineItem {
  key: string;
  sequence: string;
  label: string;
  detail: string;
}

function classNames(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export function RoomArtifactPage({
  children,
  testId,
}: {
  children: ReactNode;
  testId?: string;
}) {
  return (
    <main className="room-artifact-page" data-testid={testId}>
      {children}
    </main>
  );
}

export function RoomArtifactLoading({ label }: { label: string }) {
  return (
    <main className="room-artifact-page" role="status" aria-live="polite">
      <div className="room-artifact-loading">{label}</div>
    </main>
  );
}

export function RoomArtifactHeader({
  backTo,
  backLabel,
  kicker,
  title,
  summary,
  summaryTestId,
  statusLabel,
  statusTone,
  roomCode,
}: {
  backTo: string;
  backLabel: string;
  kicker: string;
  title: string;
  summary: string;
  summaryTestId?: string;
  statusLabel: string;
  statusTone: RoomArtifactStatusTone;
  roomCode?: string;
}) {
  return (
    <header className="room-artifact-header">
      <div>
        <Link to={backTo} className="room-artifact-back">
          <ArrowLeft size={15} aria-hidden="true" /> {backLabel}
        </Link>
        <div className="room-artifact-kicker">{kicker}</div>
        <h1 className="room-artifact-title">{title}</h1>
        <p className="room-artifact-summary" data-testid={summaryTestId}>{summary}</p>
      </div>
      <div className="room-artifact-status-rail">
        <span className={classNames('room-artifact-status', `room-artifact-status--${statusTone}`)}>
          {statusLabel}
        </span>
        {roomCode && <span className="room-artifact-room-code">{roomCode}</span>}
      </div>
    </header>
  );
}

export function RoomArtifactNotice({
  children,
  icon,
  tone = 'neutral',
  testId,
}: {
  children: ReactNode;
  icon: ReactNode;
  tone?: 'neutral' | 'locked';
  testId?: string;
}) {
  return (
    <div
      className={classNames('room-artifact-notice', tone === 'locked' && 'room-artifact-notice--locked')}
      role="status"
      aria-live={tone === 'neutral' ? 'polite' : undefined}
      data-testid={testId}
    >
      {icon}
      <span>{children}</span>
    </div>
  );
}

export function RoomArtifactMetricGrid({
  metrics,
  ariaLabel = 'Artifact metrics',
  testId,
}: {
  metrics: RoomArtifactMetric[];
  ariaLabel?: string;
  testId?: string;
}) {
  return (
    <section className="room-artifact-metric-grid" aria-label={ariaLabel} data-testid={testId}>
      {metrics.map((metric) => (
        <article key={metric.label} className="room-artifact-metric-card">
          <span className="room-artifact-metric-label">{metric.label}</span>
          <strong className="room-artifact-metric-value">{metric.value}</strong>
          <span className="room-artifact-metric-detail">{metric.detail}</span>
        </article>
      ))}
    </section>
  );
}

export function RoomArtifactGrid({ children }: { children: ReactNode }) {
  return <div className="room-artifact-grid">{children}</div>;
}

export function RoomArtifactPanel({
  children,
  icon,
  title,
  ariaLabel,
  testId,
  prominent = false,
}: {
  children: ReactNode;
  icon: ReactNode;
  title: string;
  ariaLabel: string;
  testId?: string;
  prominent?: boolean;
}) {
  return (
    <section
      className={classNames('room-artifact-panel', prominent && 'room-artifact-panel--hero')}
      aria-label={ariaLabel}
      data-testid={testId}
    >
      <h2 className="room-artifact-panel-title">
        {icon} {title}
      </h2>
      {children}
    </section>
  );
}

export function RoomArtifactEvidenceList({ items }: { items: RoomArtifactEvidenceItem[] }) {
  return (
    <div className="room-artifact-evidence-list">
      {items.map((item) => (
        <article key={item.label} className="room-artifact-evidence-item">
          <span className="room-artifact-evidence-label">{item.label}</span>
          <strong className="room-artifact-evidence-value">{item.value}</strong>
          <p className="room-artifact-evidence-detail">{item.detail}</p>
        </article>
      ))}
    </div>
  );
}

function copyTextFallback(text: string) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);
  if (!copied) throw new Error('copy command failed');
}

export function RoomArtifactJsonExport({
  artifact,
  filename,
  testId,
  copyTestId,
  downloadTestId,
  statusTestId,
}: {
  artifact: unknown;
  filename: string;
  testId?: string;
  copyTestId?: string;
  downloadTestId?: string;
  statusTestId?: string;
}) {
  const [status, setStatus] = useState('Verification JSON ready.');
  const artifactJson = useMemo(() => JSON.stringify(artifact, null, 2), [artifact]);

  async function handleCopy() {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(artifactJson);
      } else {
        copyTextFallback(artifactJson);
      }
      setStatus('Verification JSON copied.');
    } catch {
      try {
        copyTextFallback(artifactJson);
        setStatus('Verification JSON copied.');
      } catch {
        setStatus('Copy unavailable. Download JSON instead.');
      }
    }
  }

  function handleDownload() {
    const blob = new Blob([artifactJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setStatus('Verification JSON download started.');
  }

  return (
    <div className="room-artifact-export" data-testid={testId}>
      <div className="room-artifact-export-actions">
        <button
          type="button"
          className="room-artifact-export-button"
          onClick={handleCopy}
          data-testid={copyTestId}
        >
          <Clipboard size={15} aria-hidden="true" /> Copy JSON
        </button>
        <button
          type="button"
          className="room-artifact-export-button"
          onClick={handleDownload}
          data-testid={downloadTestId}
        >
          <Download size={15} aria-hidden="true" /> Download JSON
        </button>
      </div>
      <p className="room-artifact-export-status" role="status" aria-live="polite" data-testid={statusTestId}>
        {status}
      </p>
    </div>
  );
}

export function RoomArtifactBulletList({
  items,
  highlight = false,
}: {
  items: string[];
  highlight?: boolean;
}) {
  return (
    <ul className={classNames('room-artifact-list', highlight && 'room-artifact-list--highlight')}>
      {items.map((item, index) => (
        <li key={`${index}-${item}`}>{item}</li>
      ))}
    </ul>
  );
}

export function RoomArtifactTimeline({
  items,
  emptyMessage,
  compactSequence = false,
}: {
  items: RoomArtifactTimelineItem[];
  emptyMessage?: string;
  compactSequence?: boolean;
}) {
  if (items.length === 0) {
    return emptyMessage ? <p className="room-artifact-empty">{emptyMessage}</p> : null;
  }

  return (
    <ol className={classNames('room-artifact-timeline', compactSequence && 'room-artifact-timeline--compact')}>
      {items.map((item) => (
        <li key={item.key} className="room-artifact-timeline-item">
          <span className="room-artifact-sequence">{item.sequence}</span>
          <div>
            <strong className="room-artifact-timeline-label">{item.label}</strong>
            <p className="room-artifact-timeline-detail">{item.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function RoomArtifactFooter({
  children,
  icon,
  ariaLabel = 'Artifact limits',
}: {
  children: ReactNode;
  icon: ReactNode;
  ariaLabel?: string;
}) {
  return (
    <section className="room-artifact-footer" aria-label={ariaLabel}>
      {icon}
      {children}
    </section>
  );
}
