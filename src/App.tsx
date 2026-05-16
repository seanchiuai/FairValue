import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ToastProvider } from './contexts/ToastContext';
import ToastContainer from './components/ToastContainer';
import ErrorBoundary from './components/ErrorBoundary';
import JoinPage from './pages/JoinPage';

const Markets = React.lazy(() => import('./pages/Markets'));
const MarketPage = React.lazy(() => import('./pages/MarketPage'));
const HostView = React.lazy(() => import('./pages/HostView'));
const PlayerView = React.lazy(() => import('./pages/PlayerView'));
const RoomReviewPage = React.lazy(() => import('./pages/RoomReviewPage'));

function RouteFallback() {
  return (
    <main
      role="status"
      aria-live="polite"
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: 'var(--bg-primary)',
        color: 'var(--text-secondary)',
        fontSize: '0.95rem',
      }}
    >
      Loading FairValue...
    </main>
  );
}

function App() {
  return (
    <ToastProvider>
      <Router>
        <ErrorBoundary>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<Markets />} />
              <Route path="/join" element={<JoinPage />} />
              <Route path="/host/:roomCode" element={<HostView />} />
              <Route path="/play/:roomCode" element={<PlayerView />} />
              <Route path="/review/:roomCode" element={<RoomReviewPage />} />
              <Route path="/market/:propertyId" element={<MarketPage />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </Router>
      <ToastContainer />
    </ToastProvider>
  );
}

export default App;
