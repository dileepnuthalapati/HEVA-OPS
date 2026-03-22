import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { initDB } from './services/db';

initDB();

if ('serviceWorker' in navigator && window.location.protocol !== 'https:') {
  // Only register service worker for web version, not in Capacitor
  try {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/service-worker.js')
        .then((registration) => {
          console.log('SW registered:', registration);
        })
        .catch((error) => {
          console.warn('SW registration failed:', error);
        });
    });
  } catch (e) {
    console.warn('Service worker not available');
  }
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
