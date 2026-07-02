"use client";

import { useEffect } from 'react';

// Fängt in der Android-App die Zurück-Geste / den Zurück-Button ab und
// navigiert im App-Verlauf zurück, statt die App zu schließen.
// (Ohne diesen Handler beendet Capacitor die App beim Zurückwischen.)
export default function BackButtonHandler() {
  useEffect(() => {
    const App = (window as any)?.Capacitor?.Plugins?.App;
    if (!App || typeof App.addListener !== 'function') return;

    let remove: (() => void) | undefined;
    const handle = App.addListener('backButton', () => {
      // Überall zurück navigieren; nur am Dashboard-Root die App schließen.
      if (window.location.pathname !== '/') {
        window.history.back();
      } else {
        App.exitApp?.();
      }
    });

    // addListener kann ein Handle oder ein Promise darauf zurückgeben.
    Promise.resolve(handle).then((h: any) => { remove = h?.remove; });
    return () => { remove?.(); };
  }, []);

  return null;
}
