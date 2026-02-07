import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import MarketPage from './pages/MarketPage';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/market/:propertyId" element={<MarketPage />} />
      </Routes>
    </Router>
  );
}

export default App;
