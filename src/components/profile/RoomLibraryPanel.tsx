import { useMemo, useState } from 'react';
import { Clock3, Crown, Download, ExternalLink, Radio, RefreshCw, Search, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { RoomLibraryRoom } from '../../hooks/useRoomLibrary';
import './RoomLibraryPanel.css';

function money(value: number) {
  return `$${Math.round(value || 0).toLocaleString()}`;
}

function date(value: number | null) {
  if (!value) return 'Not settled';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value * 1000));
}

function formatLabel(value: string) {
  return value.replace(/_/g, ' ');
}

interface RoomLibraryPanelProps {
  rooms: RoomLibraryRoom[];
  loading: boolean;
  error: string;
  onRefresh: () => void;
}

export default function RoomLibraryPanel({ rooms, loading, error, onRefresh }: RoomLibraryPanelProps) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | 'live' | 'settled'>('all');
  const visibleRooms = useMemo(() => rooms.filter((room) => {
    const matchesStatus = status === 'all' || (status === 'settled' ? room.settled : !room.settled);
    const normalizedQuery = query.trim().toLowerCase();
    return matchesStatus && (!normalizedQuery || `${room.room_code} ${room.address}`.toLowerCase().includes(normalizedQuery));
  }), [query, rooms, status]);

  return (
    <section className="room-library-panel profile-page__panel" data-testid="profile-room-library" aria-label="Room library">
      <div className="room-library-panel__head">
        <div>
          <div className="profile-page__panel-title"><Radio size={16} /> Room library</div>
          <p>Return to live rooms, settled recaps, and host review from this signed browser identity.</p>
        </div>
        <button type="button" className="profile-page__small-action" onClick={onRefresh} disabled={loading} aria-label="Refresh room library">
          <RefreshCw size={14} /> Sync rooms
        </button>
      </div>

      <div className="room-library-panel__controls">
        <label className="room-library-panel__search">
          <Search size={15} aria-hidden="true" />
          <span className="sr-only">Search rooms</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search code or property" aria-label="Search room library" />
        </label>
        <label className="room-library-panel__filter">
          <span>Show</span>
          <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} aria-label="Filter room library by status">
            <option value="all">All rooms</option>
            <option value="live">Live rooms</option>
            <option value="settled">Settled rooms</option>
          </select>
        </label>
      </div>

      {error && <div className="profile-page__notice" role="status">{error}</div>}
      {loading ? (
        <div className="room-library-panel__empty" role="status">Loading room library...</div>
      ) : visibleRooms.length === 0 ? (
        <div className="room-library-panel__empty">
          <Radio size={22} aria-hidden="true" />
          <strong>{rooms.length ? 'No rooms match this view' : 'Your room history starts here'}</strong>
          <span>{rooms.length ? 'Try another status or search term.' : 'Host or join a room and it will remain available here after the session.'}</span>
          {!rooms.length && <Link to="/join">Host or join a room <ExternalLink size={14} /></Link>}
        </div>
      ) : (
        <div className="room-library-panel__list">
          {visibleRooms.map((room) => (
            <article key={room.room_code} className="room-library-panel__row">
              <div className="room-library-panel__main">
                <div className="room-library-panel__code-row">
                  <strong>{room.room_code}</strong>
                  <span className={`room-library-panel__status room-library-panel__status--${room.settled ? 'settled' : 'live'}`}>
                    {room.settled ? 'Settled' : 'Live'}
                  </span>
                  {room.is_host && <span className="room-library-panel__role"><Crown size={12} /> Host</span>}
                </div>
                <h3>{room.address}</h3>
                <p>{formatLabel(room.market_format)} · Asking {money(room.asking_price)}</p>
              </div>
              <div className="room-library-panel__metric"><span>Players</span><strong><Users size={13} /> {room.player_count}</strong></div>
              <div className="room-library-panel__metric"><span>Activity</span><strong><Clock3 size={13} /> {date(room.last_activity_at)}</strong></div>
              <div className="room-library-panel__actions">
                {room.settled ? (
                  <Link to={`/recap/${room.room_code}`}><ExternalLink size={13} /> Recap</Link>
                ) : (
                  <Link to={`/${room.is_host ? 'host' : 'play'}/${room.room_code}`}><ExternalLink size={13} /> Open room</Link>
                )}
                {room.is_host && <Link to={`/review/${room.room_code}`}><ExternalLink size={13} /> Review</Link>}
                {room.settled && <a href={`/api/rooms/${room.room_code}/export?format=csv`} download={`fairvalue-${room.room_code.toLowerCase()}-recap.csv`}><Download size={13} /> CSV</a>}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
