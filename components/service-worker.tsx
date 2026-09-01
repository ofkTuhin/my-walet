'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker.
 *
 * Registered after load rather than during render, so fetching and parsing the
 * worker never competes with the first paint.
 *
 * Development is deliberately excluded: a worker that caches build assets will
 * happily serve yesterday's chunks over a hot reload, which looks exactly like
 * a bug in whatever you were editing.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Registration failing costs nothing but offline support, so it must
        // not surface as an error to someone just trying to read a balance.
      });
    };

    if (document.readyState === 'complete') {
      register();
      return;
    }
    window.addEventListener('load', register);
    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
