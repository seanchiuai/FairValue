import { Link } from 'react-router-dom';
import { ArrowLeft, Bookmark, History, RefreshCw, ShieldCheck, UserRound, WalletCards, X } from 'lucide-react';
import { useMemo } from 'react';
import PlayerReputationPanel from '../components/player/PlayerReputationPanel';
import { useProperties } from '../data/properties';
import { usePropertyWatchlist } from '../hooks/usePropertyWatchlist';
import { useSession } from '../hooks/useSession';
import { useUserReputation } from '../hooks/useUserReputation';
import { useWatchlistAlerts, type WatchlistAlert } from '../hooks/useWatchlistAlerts';
import { useRoomLibrary } from '../hooks/useRoomLibrary';
import RoomLibraryPanel from '../components/profile/RoomLibraryPanel';
import { formatOutcomeLabel } from '../lib/roomMarketDisplay';
import type { UserReputationRoom } from '../types';
import './ProfilePage.css';

function formatPercent(value: number | null) {
  if (value == null) return 'New';
  return `${Math.round(value * 100)}%`;
}

function formatScore(value: number | null) {
  if (value == null) return 'New';
  return `${Math.round(value)}/100`;
}

function formatMoney(value: number) {
  return `$${Math.round(value).toLocaleString()}`;
}

function formatMarketFormat(value: string) {
  return value.replace(/_/g, ' ');
}

function formatDate(seconds: number | null) {
  if (!seconds) return 'Not settled';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(seconds * 1000));
}

function roomScore(room: UserReputationRoom) {
  if (!room.bet_count) return 'No scored bets';
  return `${room.correct_bets}/${room.bet_count} correct`;
}

function formatAlertType(alertType: WatchlistAlert['alert_type']) {
  return alertType === 'price_below' ? 'Price below' : 'Price above';
}

function alertPropertyLabel(alert: WatchlistAlert) {
  return alert.property?.address || `Property ${alert.property_id}`;
}

export default function ProfilePage() {
  const {
    nickname,
    userToken,
    identityReady,
    identityLoading,
    identityError,
    ensureIdentity,
  } = useSession();
  const {
    reputation,
    reputationLoading,
    reputationError,
    refreshReputation,
  } = useUserReputation(userToken);
  const { properties, loading: propertiesLoading } = useProperties();
  const {
    watchlistItems,
    syncStatus,
    isServerBacked,
    removeProperty,
    updateProperty,
  } = usePropertyWatchlist({ userToken });
  const {
    watchlistAlerts,
    watchlistAlertsLoading,
    watchlistAlertsError,
    refreshWatchlistAlerts,
    acknowledgeWatchlistAlert,
  } = useWatchlistAlerts(userToken);
  const {
    rooms: roomLibrary,
    loading: roomLibraryLoading,
    error: roomLibraryError,
    refresh: refreshRoomLibrary,
  } = useRoomLibrary(userToken);

  const marketFormatRows = useMemo(
    () => Object.entries(reputation?.market_formats || {})
      .sort((left, right) => right[1] - left[1]),
    [reputation?.market_formats]
  );
  const propertyById = useMemo(
    () => new Map(properties.map((property) => [property.id, property])),
    [properties]
  );
  const watchedProperties = useMemo(
    () => watchlistItems.map((item) => ({
      item,
      property: propertyById.get(item.property_id) || null,
    })),
    [propertyById, watchlistItems]
  );
  const watchedPropertyIds = useMemo(
    () => new Set(watchlistItems.map((item) => item.property_id)),
    [watchlistItems]
  );
  const visibleWatchlistAlerts = useMemo(
    () => watchlistAlerts.filter((alert) => watchedPropertyIds.has(alert.property_id)),
    [watchedPropertyIds, watchlistAlerts]
  );
  const recentRooms = reputation?.recent_rooms || [];
  const displayName = reputation?.nickname || nickname || 'FairValue player';
  const readyAlertCount = useMemo(
    () => visibleWatchlistAlerts.filter((alert) => alert.status === 'ready').length,
    [visibleWatchlistAlerts]
  );

  const handleRefresh = async () => {
    try {
      if (!identityReady) await ensureIdentity();
      await refreshReputation();
    } catch {
      // useSession owns the visible identity error state.
    }
  };

  const handleAlertRefresh = async () => {
    try {
      if (!identityReady) await ensureIdentity();
      await refreshWatchlistAlerts(true);
    } catch {
      // useSession owns the visible identity error state.
    }
  };

  return (
    <main className="profile-page" data-testid="profile-page">
      <header className="profile-page__header">
        <Link to="/" className="profile-page__back">
          <ArrowLeft size={16} />
          Markets
        </Link>
        <div className="profile-page__identity" data-testid="profile-identity-status">
          <ShieldCheck size={16} />
          {identityReady ? 'Private signed profile' : identityLoading ? 'Signing in...' : 'Profile unavailable'}
        </div>
      </header>

      <section className="profile-page__intro">
        <div className="profile-page__title-block">
          <span className="profile-page__eyebrow">Prediction history</span>
          <h1>My prediction profile</h1>
          <p>{displayName}</p>
        </div>
        <button
          type="button"
          className="profile-page__refresh"
          disabled={identityLoading || reputationLoading}
          onClick={handleRefresh}
        >
          <RefreshCw size={15} />
          Refresh
        </button>
      </section>

      {identityError && (
        <div className="profile-page__notice" role="status">
          {identityError}
        </div>
      )}

      <section className="profile-page__grid">
        <PlayerReputationPanel
          reputation={reputation}
          loading={reputationLoading || identityLoading}
          error={reputationError}
          onRefresh={handleRefresh}
        />

        <section className="profile-page__panel" aria-label="Private reputation scope">
          <div className="profile-page__panel-title">
            <UserRound size={16} />
            Account boundary
          </div>
          <p className="profile-page__copy">
            This page is backed by the signed user token in this browser and excludes host tokens, user tokens,
            player session IDs, and raw evidence documents.
          </p>
          <div className="profile-page__mini-stats">
            <div>
              <span>Markets played</span>
              <strong>{marketFormatRows.length}</strong>
            </div>
            <div>
              <span>Last settlement</span>
              <strong>{formatDate(reputation?.last_settled_at || null)}</strong>
            </div>
          </div>
        </section>
      </section>

      <RoomLibraryPanel
        rooms={roomLibrary}
        loading={roomLibraryLoading || identityLoading}
        error={roomLibraryError}
        onRefresh={refreshRoomLibrary}
      />

      <section className="profile-page__panel" data-testid="profile-history" aria-label="Recent prediction history">
        <div className="profile-page__section-head">
          <div className="profile-page__panel-title">
            <History size={16} />
            Recent rooms
          </div>
          <span>{recentRooms.length} settled</span>
        </div>

        {recentRooms.length > 0 ? (
          <div className="profile-page__history-list">
            {recentRooms.map((room) => (
              <article key={room.room_code} className="profile-page__history-row">
                <div className="profile-page__room-main">
                  <strong>{room.room_code}</strong>
                  <span>{formatMarketFormat(room.market_format)}</span>
                </div>
                <div>
                  <span>Outcome</span>
                  <strong>{formatOutcomeLabel(room.winning_outcome || '')}</strong>
                </div>
                <div>
                  <span>Score</span>
                  <strong>{roomScore(room)}</strong>
                </div>
                <div>
                  <span>Calibration</span>
                  <strong>{formatScore(room.calibration_score)}</strong>
                </div>
                <div>
                  <span>Wagered</span>
                  <strong>{formatMoney(room.total_wagered)}</strong>
                </div>
                <div>
                  <span>Settled</span>
                  <strong>{formatDate(room.settled_at)}</strong>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="profile-page__empty">
            No settled prediction rooms yet.
          </div>
        )}
      </section>

      <section className="profile-page__panel" aria-label="Portfolio status">
        <div className="profile-page__panel-title">
          <WalletCards size={16} />
          Simulation portfolio
        </div>
        <div className="profile-page__mini-stats profile-page__mini-stats--wide">
          <div>
            <span>Accuracy</span>
            <strong>{formatPercent(reputation?.accuracy ?? null)}</strong>
          </div>
          <div>
            <span>Wagered</span>
            <strong>{formatMoney(reputation?.total_wagered || 0)}</strong>
          </div>
          <div>
            <span>Payout</span>
            <strong>{formatMoney(reputation?.total_payout || 0)}</strong>
          </div>
        </div>
      </section>

      <section className="profile-page__panel" data-testid="profile-watchlist" aria-label="Property watchlist">
        <div className="profile-page__section-head">
          <div className="profile-page__panel-title">
            <Bookmark size={16} />
            Watchlist
          </div>
          <span>{watchlistItems.length} saved · {isServerBacked ? 'Signed sync' : syncStatus === 'syncing' ? 'Syncing' : 'Browser local'}</span>
        </div>

        {propertiesLoading && watchedProperties.length === 0 ? (
          <div className="profile-page__empty">
            Loading watchlist...
          </div>
        ) : watchedProperties.length > 0 ? (
          <div className="profile-page__watchlist-list">
            {watchedProperties.map(({ item, property }) => {
              const label = property?.address || `Property ${item.property_id}`;
              return (
                <article key={item.property_id} className="profile-page__watchlist-row">
                  <div className="profile-page__watchlist-main">
                    <strong>{label}</strong>
                    <span>
                      {property
                        ? `${property.city}, ${property.state} ${property.zipCode}`
                        : 'Property details unavailable'}
                    </span>
                  </div>
                  <div>
                    <span>Price</span>
                    <strong>{property ? formatMoney(property.price) : 'Unknown'}</strong>
                  </div>
                  <div>
                    <span>Added</span>
                    <strong>{formatDate(item.added_at)}</strong>
                  </div>
                  <Link to={`/market/${item.property_id}`} className="profile-page__watchlist-link">
                    Open
                  </Link>
                  <button
                    type="button"
                    className="profile-page__watchlist-remove"
                    aria-label={`Remove ${label} from watchlist`}
                    onClick={() => removeProperty(item.property_id)}
                  >
                    <X size={14} />
                  </button>
                  <div className="profile-page__watchlist-tools">
                    <label>
                      <span>Note</span>
                      <input
                        type="text"
                        value={item.note || ''}
                        onChange={(event) => updateProperty(item.property_id, { note: event.target.value })}
                        aria-label={`Watch note for ${label}`}
                        placeholder="Private note"
                      />
                    </label>
                    <label>
                      <span>Alert below</span>
                      <input
                        type="number"
                        min="1"
                        value={item.alert_below ?? ''}
                        onChange={(event) => updateProperty(item.property_id, { alert_below: event.target.value ? Number(event.target.value) : null })}
                        aria-label={`Alert below for ${label}`}
                        placeholder="Price"
                      />
                    </label>
                    <label>
                      <span>Alert above</span>
                      <input
                        type="number"
                        min="1"
                        value={item.alert_above ?? ''}
                        onChange={(event) => updateProperty(item.property_id, { alert_above: event.target.value ? Number(event.target.value) : null })}
                        aria-label={`Alert above for ${label}`}
                        placeholder="Price"
                      />
                    </label>
                    <span className="profile-page__watchlist-sync-note">Saved thresholds only</span>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="profile-page__empty">
            No watched properties yet.
          </div>
        )}
      </section>

      <section className="profile-page__panel" data-testid="profile-watchlist-alerts" aria-label="Watchlist price alerts">
        <div className="profile-page__section-head">
          <div className="profile-page__panel-title">
            <ShieldCheck size={16} />
            Price alert inbox
          </div>
          <div className="profile-page__section-actions">
            <span>{readyAlertCount} ready · In-app queue</span>
            <button
              type="button"
              className="profile-page__small-action"
              disabled={identityLoading || watchlistAlertsLoading}
              onClick={handleAlertRefresh}
            >
              <RefreshCw size={14} />
              Evaluate
            </button>
          </div>
        </div>

        {watchlistAlertsError && (
          <div className="profile-page__notice" role="status">
            {watchlistAlertsError}
          </div>
        )}

        {watchlistAlertsLoading && visibleWatchlistAlerts.length === 0 ? (
          <div className="profile-page__empty">
            Evaluating saved thresholds...
          </div>
        ) : visibleWatchlistAlerts.length > 0 ? (
          <div className="profile-page__alert-list">
            {visibleWatchlistAlerts.map((alert) => {
              const label = alertPropertyLabel(alert);
              return (
                <article key={alert.alert_id} className="profile-page__alert-row">
                  <div className="profile-page__alert-main">
                    <strong>{label}</strong>
                    <span>{formatAlertType(alert.alert_type)} · {formatDate(alert.triggered_at)}</span>
                    {alert.message && <p>{alert.message}</p>}
                  </div>
                  <div>
                    <span>Current</span>
                    <strong>{formatMoney(alert.current_price)}</strong>
                  </div>
                  <div>
                    <span>Threshold</span>
                    <strong>{formatMoney(alert.threshold)}</strong>
                  </div>
                  <div>
                    <span>Status</span>
                    <strong>{alert.status === 'ready' ? 'Ready' : 'Acknowledged'}</strong>
                  </div>
                  {alert.status === 'ready' ? (
                    <button
                      type="button"
                      className="profile-page__small-action"
                      onClick={() => acknowledgeWatchlistAlert(alert.alert_id)}
                      aria-label={`Acknowledge alert for ${label}`}
                    >
                      <ShieldCheck size={14} />
                      Acknowledge
                    </button>
                  ) : (
                    <span className="profile-page__watchlist-sync-note">Delivered in app</span>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="profile-page__empty">
            No threshold crossings in the current property snapshot.
          </div>
        )}
        <p className="profile-page__copy">
          Alerts are queued for this private profile only. No email, SMS, push, or broker notifications are sent.
        </p>
      </section>
    </main>
  );
}
