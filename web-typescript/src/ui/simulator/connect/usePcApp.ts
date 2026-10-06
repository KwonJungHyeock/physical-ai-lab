'use client';

/**
 * The installable PC app: registers the service worker (public/sw.js, from
 * tools/build/gen-sw.mjs) so the console works offline, and offers Chrome's/Edge's
 * install prompt as a button.
 *
 * Service workers only run on https or localhost, so on the robot's own page
 * (http://로봇IP:8080) none of this happens — that page is live by design.
 */

import { useEffect, useState } from 'react';

import { warmPython } from '@/engine/python/client';

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function usePcApp() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [offline, setOffline] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches;
    // Read after hydration so the server-rendered HTML and the first client render agree.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInstalled(standalone);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    const onInstalled = () => {
      setPrompt(null);
      setInstalled(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);

    let alive = true;
    const onMessage = (e: MessageEvent<{ type?: string }>) => {
      if (e.data?.type === 'kept' && alive) setOffline(true);
    };
    if (process.env.NODE_ENV === 'production' && window.isSecureContext && 'serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', onMessage);
      void (async () => {
        try {
          await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
          const reg = await navigator.serviceWorker.ready;
          // Keep what this page loaded before the worker was in charge (scripts, fonts, models).
          const urls = [location.pathname, ...performance.getEntriesByType('resource').map((r) => r.name)];
          reg.active?.postMessage({ type: 'keep', urls });
          // The installed app also loads Python once in the background, so the Python levels work offline from the start.
          if (standalone) window.setTimeout(() => void warmPython().catch(() => undefined), 3000);
        } catch {
          /* no offline copy: the app still works online */
        }
      })();
    }
    return () => {
      alive = false;
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      if ('serviceWorker' in navigator) navigator.serviceWorker.removeEventListener('message', onMessage);
    };
  }, []);

  return {
    /** Chrome/Edge will install the app when asked (null: not offered, or already installed). */
    install: prompt
      ? async () => {
          await prompt.prompt();
          await prompt.userChoice;
          setPrompt(null);
        }
      : null,
    /** Everything the console needs is saved on this PC. */
    offline,
    /** Running as the installed app, in its own window. */
    installed,
  };
}
