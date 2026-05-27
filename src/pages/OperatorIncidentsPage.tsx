import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ClipboardCheck,
  Eye,
  FileWarning,
  Filter,
  Gauge,
  KeyRound,
  ListChecks,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import './OperatorIncidentsPage.css';

type OperatorSeverity = 'critical' | 'high' | 'medium' | 'low';
type OperatorWorkflowStatus = 'open' | 'investigating' | 'waiting_on_host' | 'resolved' | 'dismissed';

type IncidentEvidence = {
  label: string;
  value: string;
  detail: string;
};

type IncidentTimelineEntry = {
  entry_id: string;
  at: number;
  actor: string;
  action: string;
  status: OperatorWorkflowStatus;
  assignee: string | null;
  note: string | null;
};

type IncidentWorkflow = {
  schema_version: string;
  tracked: boolean;
  status: OperatorWorkflowStatus;
  assignee: string | null;
  updated_at: number;
  last_seen_at: number | null;
  timeline: IncidentTimelineEntry[];
  limitations: string[];
};

type OperatorIncident = {
  incident_id: string;
  room_code: string;
  incident_type: string;
  severity: OperatorSeverity;
  status: OperatorWorkflowStatus;
  title: string;
  summary: string;
  evidence: IncidentEvidence[];
  recommended_actions: string[];
  last_event_sequence: number;
  privacy_classification: string;
  limitations: string[];
  workflow?: IncidentWorkflow;
};

type OperatorIncidentQueue = {
  schema_version?: string;
  workflow_schema_version?: string;
  generated_at?: number;
  count?: number;
  total_matches?: number;
  summary?: {
    total?: number;
    by_severity?: Partial<Record<OperatorSeverity, number>>;
    by_type?: Record<string, number>;
  };
  workflow_summary?: {
    total_tracked?: number;
    by_status?: Partial<Record<OperatorWorkflowStatus, number>>;
  };
  incidents?: OperatorIncident[];
  limitations?: string[];
  error?: string;
  message?: string;
};

type OperatorReplayReview = {
  schema_version?: string;
  replay_status?: {
    ok?: boolean;
    event_count?: number;
    last_sequence?: number;
    mismatch_count?: number;
  };
  replay_summary?: {
    settled?: boolean;
    winning_outcome?: string | null;
    settlement_evidence_status?: string;
    total_trades?: number;
    player_count?: number;
    activity_count?: number;
    room_phase?: string;
  };
  limitations?: string[];
  error?: string;
};

const statusOptions: OperatorWorkflowStatus[] = ['open', 'investigating', 'waiting_on_host', 'resolved', 'dismissed'];
const severityOptions: Array<OperatorSeverity | ''> = ['', 'critical', 'high', 'medium', 'low'];
const opsTokenStorageKey = 'fv_ops_token';

function readStoredOpsToken() {
  if (typeof sessionStorage === 'undefined') return '';
  try {
    return sessionStorage.getItem(opsTokenStorageKey) || '';
  } catch {
    return '';
  }
}

function persistOpsToken(token: string) {
  if (typeof sessionStorage === 'undefined') return;
  try {
    if (token) sessionStorage.setItem(opsTokenStorageKey, token);
    else sessionStorage.removeItem(opsTokenStorageKey);
  } catch {
    // Session storage can fail in private browser modes; the in-memory value still works.
  }
}

function formatLabel(value: string) {
  return value.replace(/_/g, ' ');
}

function formatUnixTime(seconds?: number | null) {
  if (!seconds) return 'Pending';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(seconds * 1000));
}

function buildOpsHeaders(token: string, json = false) {
  const headers: Record<string, string> = {};
  if (json) headers['Content-Type'] = 'application/json';
  if (token.trim()) headers.Authorization = `Bearer ${token.trim()}`;
  return headers;
}

async function readQueueResponse(response: Response): Promise<OperatorIncidentQueue> {
  return response.json().catch(() => ({}));
}

async function readWorkflowResponse(response: Response): Promise<IncidentWorkflow & { error?: string }> {
  return response.json().catch(() => ({}));
}

async function readReplayResponse(response: Response): Promise<OperatorReplayReview> {
  return response.json().catch(() => ({}));
}

export default function OperatorIncidentsPage() {
  const [opsToken, setOpsToken] = useState(readStoredOpsToken);
  const [severityFilter, setSeverityFilter] = useState<OperatorSeverity | ''>('');
  const [roomFilter, setRoomFilter] = useState('');
  const [queue, setQueue] = useState<OperatorIncidentQueue | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedIncidentId, setSelectedIncidentId] = useState('');
  const [workflowStatus, setWorkflowStatus] = useState<OperatorWorkflowStatus>('open');
  const [assignee, setAssignee] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [replayReview, setReplayReview] = useState<OperatorReplayReview | null>(null);
  const [replayLoading, setReplayLoading] = useState(false);
  const [replayError, setReplayError] = useState('');

  const incidents = queue?.incidents || [];
  const selectedIncident = useMemo(
    () => incidents.find((incident) => incident.incident_id === selectedIncidentId) || incidents[0] || null,
    [incidents, selectedIncidentId]
  );
  const severeCount = (queue?.summary?.by_severity?.critical || 0) + (queue?.summary?.by_severity?.high || 0);
  const trackedCount = queue?.workflow_summary?.total_tracked || 0;

  const loadIncidents = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    setSaveMessage('');
    const params = new URLSearchParams({ limit: '100' });
    if (severityFilter) params.set('severity', severityFilter);
    if (roomFilter.trim()) params.set('room_code', roomFilter.trim().toUpperCase());
    try {
      const response = await fetch(`/api/ops/incidents?${params.toString()}`, {
        headers: buildOpsHeaders(opsToken),
      });
      const data = await readQueueResponse(response);
      if (!response.ok || data.error) {
        throw new Error(data.message || data.error || 'Operator incidents unavailable');
      }
      setQueue(data);
      setSelectedIncidentId((current) => {
        if (current && data.incidents?.some((incident) => incident.incident_id === current)) return current;
        return data.incidents?.[0]?.incident_id || '';
      });
    } catch (error) {
      setQueue(null);
      setSelectedIncidentId('');
      setLoadError(error instanceof Error ? error.message : 'Operator incidents unavailable');
    } finally {
      setLoading(false);
    }
  }, [opsToken, roomFilter, severityFilter]);

  useEffect(() => {
    persistOpsToken(opsToken);
  }, [opsToken]);

  useEffect(() => {
    void loadIncidents();
  }, [loadIncidents]);

  useEffect(() => {
    if (!selectedIncident) {
      setWorkflowStatus('open');
      setAssignee('');
      setNote('');
      setReplayReview(null);
      setReplayError('');
      return;
    }
    setWorkflowStatus(selectedIncident.workflow?.status || selectedIncident.status || 'open');
    setAssignee(selectedIncident.workflow?.assignee || '');
    setNote('');
    setReplayReview(null);
    setReplayError('');
  }, [
    selectedIncident?.incident_id,
    selectedIncident?.status,
    selectedIncident?.workflow?.assignee,
    selectedIncident?.workflow?.status,
  ]);

  async function handleLoadReplay() {
    if (!selectedIncident) return;
    setReplayLoading(true);
    setReplayError('');
    try {
      const response = await fetch(`/api/ops/incidents/${selectedIncident.incident_id}/replay`, {
        headers: buildOpsHeaders(opsToken),
      });
      const data = await readReplayResponse(response);
      if ((!response.ok && response.status !== 409) || data.error) {
        throw new Error(data.error || 'Replay review unavailable');
      }
      setReplayReview(data);
      if (response.status === 409 || data.replay_status?.ok === false) {
        setReplayError('Replay mismatch needs operator review.');
      }
    } catch (error) {
      setReplayReview(null);
      setReplayError(error instanceof Error ? error.message : 'Replay review unavailable');
    } finally {
      setReplayLoading(false);
    }
  }

  async function handleSaveWorkflow() {
    if (!selectedIncident) return;
    setSaving(true);
    setSaveMessage('');
    try {
      const response = await fetch(`/api/ops/incidents/${selectedIncident.incident_id}`, {
        method: 'PATCH',
        headers: buildOpsHeaders(opsToken, true),
        body: JSON.stringify({
          status: workflowStatus,
          assignee,
          note,
        }),
      });
      const workflow = await readWorkflowResponse(response);
      if (!response.ok || workflow.error) {
        throw new Error(workflow.error || 'Workflow update failed');
      }
      setNote('');
      setQueue((current) => {
        if (!current?.incidents) return current;
        return {
          ...current,
          incidents: current.incidents.map((incident) => (
            incident.incident_id === selectedIncident.incident_id
              ? { ...incident, status: workflow.status, workflow }
              : incident
          )),
        };
      });
      setSaveMessage('Workflow saved.');
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : 'Workflow update failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="operator-incidents" data-testid="operator-incidents-page">
      <header className="operator-incidents__topbar">
        <Link to="/" className="operator-incidents__back">
          <ArrowLeft size={16} aria-hidden="true" />
          Markets
        </Link>
        <div className="operator-incidents__scope" data-testid="operator-incidents-scope">
          <ShieldCheck size={16} aria-hidden="true" />
          Redacted ops queue
        </div>
      </header>

      <section className="operator-incidents__intro">
        <div>
          <span className="operator-incidents__eyebrow">Operations</span>
          <h1>Operator incidents</h1>
          <p>
            Redacted room triage with persisted workflow state, settlement evidence flags, event-log gaps, and replay-safe review links.
          </p>
        </div>
        <button
          type="button"
          className="operator-incidents__refresh"
          onClick={() => void loadIncidents()}
          disabled={loading}
        >
          <RefreshCw size={15} aria-hidden="true" />
          Refresh
        </button>
      </section>

      <section className="operator-incidents__metrics" aria-label="Operator incident metrics">
        <article>
          <span>Total</span>
          <strong>{queue?.total_matches ?? queue?.count ?? 0}</strong>
          <p>{loading ? 'Loading queue' : `${incidents.length} shown`}</p>
        </article>
        <article>
          <span>High risk</span>
          <strong>{severeCount}</strong>
          <p>Critical plus high severity</p>
        </article>
        <article>
          <span>Tracked</span>
          <strong>{trackedCount}</strong>
          <p>Persisted workflow records</p>
        </article>
        <article>
          <span>Generated</span>
          <strong>{formatUnixTime(queue?.generated_at)}</strong>
          <p>{queue?.schema_version || 'queue pending'}</p>
        </article>
      </section>

      <section className="operator-incidents__filters" aria-label="Incident filters">
        <label>
          <Filter size={15} aria-hidden="true" />
          <span>Severity</span>
          <select
            value={severityFilter}
            onChange={(event) => setSeverityFilter(event.target.value as OperatorSeverity | '')}
            data-testid="operator-severity-filter"
          >
            {severityOptions.map((severity) => (
              <option key={severity || 'all'} value={severity}>{severity ? formatLabel(severity) : 'all severities'}</option>
            ))}
          </select>
        </label>
        <label>
          <Gauge size={15} aria-hidden="true" />
          <span>Room</span>
          <input
            value={roomFilter}
            onChange={(event) => setRoomFilter(event.target.value)}
            placeholder="AB12"
            inputMode="text"
            data-testid="operator-room-filter"
          />
        </label>
        <label className="operator-incidents__token">
          <KeyRound size={15} aria-hidden="true" />
          <span>Ops token</span>
          <input
            value={opsToken}
            onChange={(event) => setOpsToken(event.target.value)}
            placeholder="optional locally"
            type="password"
            autoComplete="off"
            data-testid="operator-token-input"
          />
        </label>
      </section>

      {loadError && (
        <div className="operator-incidents__notice" role="status" data-testid="operator-incidents-error">
          {loadError}
        </div>
      )}

      <section className="operator-incidents__workspace">
        <div className="operator-incidents__list" data-testid="operator-incidents-list">
          <div className="operator-incidents__panel-head">
            <h2><FileWarning size={16} aria-hidden="true" /> Queue</h2>
            <span>{loading ? 'loading' : `${incidents.length} incident${incidents.length === 1 ? '' : 's'}`}</span>
          </div>

          {incidents.length > 0 ? (
            <div className="operator-incidents__cards">
              {incidents.map((incident) => (
                <button
                  type="button"
                  key={incident.incident_id}
                  className={`operator-incidents__card ${selectedIncident?.incident_id === incident.incident_id ? 'operator-incidents__card--active' : ''}`}
                  onClick={() => {
                    setSelectedIncidentId(incident.incident_id);
                    setSaveMessage('');
                  }}
                >
                  <span className={`operator-incidents__severity operator-incidents__severity--${incident.severity}`}>
                    {incident.severity}
                  </span>
                  <span className="operator-incidents__card-title">{incident.title}</span>
                  <span className="operator-incidents__card-meta">
                    {incident.room_code} - {formatLabel(incident.incident_type)} - {formatLabel(incident.status)}
                  </span>
                  <span className="operator-incidents__card-summary">{incident.summary}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="operator-incidents__empty">
              {loading ? 'Loading generated incidents...' : 'No generated incidents match the current filters.'}
            </p>
          )}
        </div>

        <aside className="operator-incidents__detail" data-testid="operator-incident-detail" aria-label="Selected incident detail">
          {selectedIncident ? (
            <>
              <div className="operator-incidents__detail-head">
                <div>
                  <span className={`operator-incidents__severity operator-incidents__severity--${selectedIncident.severity}`}>
                    {selectedIncident.severity}
                  </span>
                  <h2>{selectedIncident.title}</h2>
                  <p>{selectedIncident.summary}</p>
                </div>
                <div className="operator-incidents__room-code">{selectedIncident.room_code}</div>
              </div>

              <div className="operator-incidents__links">
                <Link to={`/review/${selectedIncident.room_code}`}>
                  <Eye size={15} aria-hidden="true" />
                  Review
                </Link>
                <Link to={`/host/${selectedIncident.room_code}`}>
                  <Gauge size={15} aria-hidden="true" />
                  Host
                </Link>
                <button
                  type="button"
                  onClick={() => void handleLoadReplay()}
                  disabled={replayLoading}
                  data-testid="operator-incident-replay-check"
                >
                  <RefreshCw size={15} aria-hidden="true" />
                  {replayLoading ? 'Checking' : 'Check replay'}
                </button>
              </div>

              <section className="operator-incidents__replay" data-testid="operator-incident-replay-panel" aria-label="Replay projection check">
                <div className="operator-incidents__panel-head">
                  <h3><ShieldCheck size={15} aria-hidden="true" /> Replay guard</h3>
                  <span>{replayReview ? (replayReview.replay_status?.ok ? 'match' : 'mismatch') : 'not checked'}</span>
                </div>
                {replayError && <p className="operator-incidents__replay-alert">{replayError}</p>}
                {replayReview ? (
                  <dl className="operator-incidents__replay-grid">
                    <div>
                      <dt>Status</dt>
                      <dd>{replayReview.replay_status?.ok ? 'Replay match' : 'Replay mismatch'}</dd>
                    </div>
                    <div>
                      <dt>Events</dt>
                      <dd>{replayReview.replay_status?.event_count ?? 0}</dd>
                    </div>
                    <div>
                      <dt>Last seq</dt>
                      <dd>{replayReview.replay_status?.last_sequence ?? 0}</dd>
                    </div>
                    <div>
                      <dt>Outcome</dt>
                      <dd>{replayReview.replay_summary?.winning_outcome || 'Pending'}</dd>
                    </div>
                    <div>
                      <dt>Evidence</dt>
                      <dd>{formatLabel(replayReview.replay_summary?.settlement_evidence_status || 'missing')}</dd>
                    </div>
                    <div>
                      <dt>Trades</dt>
                      <dd>{replayReview.replay_summary?.total_trades ?? 0}</dd>
                    </div>
                  </dl>
                ) : (
                  <p className="operator-incidents__empty">
                    Run a redacted replay projection check before changing workflow status or exporting review links.
                  </p>
                )}
              </section>

              <div className="operator-incidents__detail-grid">
                <section aria-label="Incident evidence">
                  <h3><ClipboardCheck size={15} aria-hidden="true" /> Evidence</h3>
                  <div className="operator-incidents__evidence-list">
                    {selectedIncident.evidence.map((item) => (
                      <article key={item.label}>
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                        <p>{item.detail}</p>
                      </article>
                    ))}
                  </div>
                </section>

                <section aria-label="Recommended actions">
                  <h3><ListChecks size={15} aria-hidden="true" /> Actions</h3>
                  <ul className="operator-incidents__actions">
                    {selectedIncident.recommended_actions.map((action) => (
                      <li key={action}>{action}</li>
                    ))}
                  </ul>
                </section>
              </div>

              <section className="operator-incidents__workflow" aria-label="Incident workflow">
                <div className="operator-incidents__panel-head">
                  <h3><ShieldCheck size={15} aria-hidden="true" /> Workflow</h3>
                  <span>{selectedIncident.workflow?.tracked ? 'tracked' : 'untracked'}</span>
                </div>
                <dl className="operator-incidents__workflow-state">
                  <div>
                    <dt>Status</dt>
                    <dd>{formatLabel(selectedIncident.workflow?.status || selectedIncident.status)}</dd>
                  </div>
                  <div>
                    <dt>Assignee</dt>
                    <dd>{selectedIncident.workflow?.assignee || 'Unassigned'}</dd>
                  </div>
                  <div>
                    <dt>Updated</dt>
                    <dd>{formatUnixTime(selectedIncident.workflow?.updated_at)}</dd>
                  </div>
                </dl>
                <div className="operator-incidents__workflow-form">
                  <label>
                    <span>Status</span>
                    <select
                      value={workflowStatus}
                      onChange={(event) => setWorkflowStatus(event.target.value as OperatorWorkflowStatus)}
                      data-testid="operator-incident-status-select"
                    >
                      {statusOptions.map((status) => (
                        <option key={status} value={status}>{formatLabel(status)}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Assignee</span>
                    <input
                      value={assignee}
                      onChange={(event) => setAssignee(event.target.value)}
                      placeholder="Ops desk"
                      data-testid="operator-incident-assignee"
                    />
                  </label>
                  <label className="operator-incidents__workflow-note">
                    <span>Note</span>
                    <textarea
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      rows={3}
                      placeholder="Public-safe internal note"
                      data-testid="operator-incident-note"
                    />
                  </label>
                  <button
                    type="button"
                    className="operator-incidents__save"
                    onClick={() => void handleSaveWorkflow()}
                    disabled={saving}
                    data-testid="operator-incident-update"
                  >
                    <ClipboardCheck size={15} aria-hidden="true" />
                    {saving ? 'Saving' : 'Save workflow'}
                  </button>
                </div>
                {saveMessage && (
                  <p className="operator-incidents__save-message" role="status" data-testid="operator-incident-save-message">
                    {saveMessage}
                  </p>
                )}
                <ol className="operator-incidents__timeline" data-testid="operator-incident-timeline">
                  {(selectedIncident.workflow?.timeline || []).slice().reverse().map((entry) => (
                    <li key={entry.entry_id}>
                      <span>{formatUnixTime(entry.at)}</span>
                      <strong>{formatLabel(entry.action)} - {formatLabel(entry.status)}</strong>
                      <p>{entry.note || entry.assignee || 'Workflow touched.'}</p>
                    </li>
                  ))}
                </ol>
              </section>

              <footer className="operator-incidents__limits">
                {selectedIncident.limitations[0]} {selectedIncident.workflow?.limitations?.[1] || queue?.limitations?.[2]}
              </footer>
            </>
          ) : (
            <p className="operator-incidents__empty">Select an incident to review evidence and workflow state.</p>
          )}
        </aside>
      </section>
    </main>
  );
}
