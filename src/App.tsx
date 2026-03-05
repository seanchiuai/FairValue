import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Markets from './pages/Markets';
import MarketPage from './pages/MarketPage';
import JoinPage from './pages/JoinPage';
import HostView from './pages/HostView';
import PlayerView from './pages/PlayerView';
import { ToastProvider } from './contexts/ToastContext';
import ToastContainer from './components/ToastContainer';
import ErrorBoundary from './components/ErrorBoundary';

function App() {
  return (
    <ToastProvider>
      <Router>
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Markets />} />
            <Route path="/join" element={<JoinPage />} />
            <Route path="/host/:roomCode" element={<HostView />} />
            <Route path="/play/:roomCode" element={<PlayerView />} />
            <Route path="/market/:propertyId" element={<MarketPage />} />
          </Routes>
        </ErrorBoundary>
      </Router>
      <ToastContainer />
    </ToastProvider>
  );
}

export default App;
