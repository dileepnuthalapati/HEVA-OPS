import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { initDB } from './services/db';

initDB();

// Register the PWA service worker in production (HTTPS required by browsers).
// We intentionally SKIP registration when running inside the Capacitor-native
// APK — native has its own asset bundle and doesn't need SW caching.
const _isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
const _isLocalhost = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);
const _isCapacitor = typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.();

if ('serviceWorker' in navigator && (_isHttps || _isLocalhost) && !_isCapacitor) {
  try {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/service-worker.js')
        .then((registration) => {
          console.log('SW registered:', registration.scope);
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
