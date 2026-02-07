import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Markets from './pages/Markets';
import MarketPage from './pages/MarketPage';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Markets />} />
        <Route path="/market/:propertyId" element={<MarketPage />} />
      </Routes>
    </Router>
  );
}

export default App;
