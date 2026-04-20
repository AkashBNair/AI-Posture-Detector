import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import './index.css';
import App from './App';
import { Dashboard } from './pages/Dashboard';
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

const Shell: React.FC = () => (
  <BrowserRouter>
    <div
      style={{
        position: 'fixed',
        top: 8,
        left: 12,
        zIndex: 50,
        display: 'flex',
        gap: 8,
        padding: '4px 8px',
        borderRadius: 999,
        background: 'rgba(15,23,42,0.75)',
        border: '1px solid rgba(148,163,184,0.45)',
      }}
    >
      <Link
        to="/"
        style={{ fontSize: 12, color: '#e5e7eb', textDecoration: 'none' }}
      >
        Live assistant
      </Link>
      <span style={{ color: '#4b5563', fontSize: 11 }}>•</span>
      <Link
        to="/dashboard"
        style={{ fontSize: 12, color: '#e5e7eb', textDecoration: 'none' }}
      >
        Analytics
      </Link>
    </div>
    <Routes>
      <Route path="/" element={<App />} />
      <Route path="/dashboard" element={<Dashboard />} />
    </Routes>
  </BrowserRouter>
);

// MediaPipe initialization is now handled by public/mediapipe-init.js
// which runs synchronously before any mediapipe scripts load

root.render(
  <React.StrictMode>
    <Shell />
  </React.StrictMode>
);

reportWebVitals();

