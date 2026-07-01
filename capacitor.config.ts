import type { CapacitorConfig } from '@capacitor/cli';

// Server-Modus: Die native App ist eine dünne Hülle, die die gehostete
// Web-App lädt und zusätzlich native Plugins (Brother-Druck) bereitstellt.
// Vorteil: ein Codebestand, Web-Updates erscheinen sofort in der App.
const config: CapacitorConfig = {
  appId: 'app.shedsync',
  appName: 'ShedSync',
  // webDir wird im Server-Modus nicht genutzt, von Capacitor aber verlangt.
  webDir: 'public',
  server: {
    url: 'https://shedsync.vercel.app',
    cleartext: false,
  },
};

export default config;
