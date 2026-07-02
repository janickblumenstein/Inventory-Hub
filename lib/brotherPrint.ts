// Brother-Druck-Adapter (Capacitor + Brother Print SDK via Cordova-Plugin).
//
// Nutzt das Plugin "AbobosSoftware/cordova-plugin-brother-label-printer", das
// das native Brother Print SDK bündelt und den PT-P710BT unterstützt.
// Zugriff im WebView über das globale `cordova.plugins.brotherPrinter`.
//
// ⚠️ Alle Brother-/Plugin-spezifischen Details leben NUR hier.
//
// Der native Druck (Bluetooth an den Cube) läuft nur in der Android-App
// (Capacitor). Im PC-/iPhone-Browser ist isNativePrintAvailable() = false und
// die App fällt automatisch auf window.print() zurück.
import { Capacitor } from '@capacitor/core';
import {
  renderLabelToPng,
  renderLocationLabelToPng,
  renderLoanLabelToPng,
  DEFAULT_LABEL_LENGTH_MM,
  type LabelItem,
  type LabelLocation,
  type LabelLoan,
} from './labelImage';

// Konfiguration des gekoppelten Druckers (in den Settings gespeichert).
export type BrotherPrinterConfig = {
  model: string;       // Brother-SDK-Modell, z.B. 'PT_P710BT'
  labelName: string;   // Tape-Größe, z.B. 'W24' (= 24mm-Tape)
  port: 'BLUETOOTH' | 'NET';
  channelInfo: string; // Bluetooth: MAC-Adresse, NET: IP-Adresse
  labelLengthMm?: number; // feste Etikettenlänge in mm (Default 60)
};

export type FoundPrinter = {
  model?: string;
  modelName?: string;
  macAddress?: string;
  ipAddress?: string;
  port?: string;
  [k: string]: any;
};

// JS-Interface des Cordova-Plugins (callback-basiert).
interface BrotherCordovaPlugin {
  findBluetoothPrinters(success: (printers: FoundPrinter[]) => void, error: (msg: string) => void): void;
  findNetworkPrinters(success: (printers: FoundPrinter[]) => void, error: (msg: string) => void): void;
  setPrinter(printer: Record<string, any>, success: () => void, error: (msg: string) => void): void;
  printViaSDK(base64: string, success: (result: { result: string }) => void, error?: (msg: string) => void): void;
}

function getPlugin(): BrotherCordovaPlugin | null {
  if (typeof window === 'undefined') return null;
  return (window as any)?.cordova?.plugins?.brotherPrinter ?? null;
}

// Fordert die Bluetooth-Laufzeitrechte an (nötig, damit Android den gekoppelten
// Drucker überhaupt auflistet). Braucht das Plugin cordova-plugin-android-permissions.
export type PermResult = 'granted' | 'denied' | 'unavailable';

export async function requestBluetoothPermissions(): Promise<PermResult> {
  if (typeof window === 'undefined') return 'unavailable';
  const perms = (window as any)?.cordova?.plugins?.permissions;
  if (!perms || typeof perms.requestPermissions !== 'function') return 'unavailable';

  const list = [
    'android.permission.BLUETOOTH_CONNECT',
    'android.permission.BLUETOOTH_SCAN',
  ];
  return new Promise((resolve) => {
    perms.requestPermissions(
      list,
      (status: any) => resolve(status?.hasPermission ? 'granted' : 'denied'),
      () => resolve('denied')
    );
  });
}

// Fordert die Kamera-Berechtigung an (für den Barcode-Scanner in der App).
export async function requestCameraPermission(): Promise<PermResult> {
  if (typeof window === 'undefined') return 'unavailable';
  const perms = (window as any)?.cordova?.plugins?.permissions;
  if (!perms || typeof perms.requestPermission !== 'function') return 'unavailable';
  return new Promise((resolve) => {
    perms.requestPermission(
      'android.permission.CAMERA',
      (status: any) => resolve(status?.hasPermission ? 'granted' : 'denied'),
      () => resolve('denied')
    );
  });
}

// Läuft die App nativ (Android via Capacitor) UND ist das Plugin verfügbar?
export function isNativePrintAvailable(): boolean {
  try {
    return Capacitor.isNativePlatform() && !!getPlugin();
  } catch {
    return false;
  }
}

// Diagnose: läuft die App nativ, und ist das Cordova-Plugin eingespritzt?
export function getNativeStatus(): { native: boolean; pluginFound: boolean } {
  let native = false;
  try { native = Capacitor.isNativePlatform(); } catch { /* ignore */ }
  return { native, pluginFound: !!getPlugin() };
}

// Ist ein Drucker konfiguriert und nativer Druck möglich?
export function canPrintNative(cfg?: BrotherPrinterConfig | null): cfg is BrotherPrinterConfig {
  return isNativePrintAvailable() && !!cfg && !!cfg.channelInfo && !!cfg.model;
}

function setPrinterAsync(plugin: BrotherCordovaPlugin, cfg: BrotherPrinterConfig, copies: number): Promise<void> {
  return new Promise((resolve, reject) => {
    plugin.setPrinter(
      {
        model: cfg.model,
        modelName: cfg.model,
        port: cfg.port,
        macAddress: cfg.port === 'BLUETOOTH' ? cfg.channelInfo : undefined,
        ipAddress: cfg.port === 'NET' ? cfg.channelInfo : undefined,
        paperLabelName: cfg.labelName,
        numberOfCopies: copies,
      },
      () => resolve(),
      (e) => reject(new Error(e))
    );
  });
}

function printImageAsync(plugin: BrotherCordovaPlugin, base64: string): Promise<void> {
  return new Promise((resolve, reject) => {
    plugin.printViaSDK(
      base64,
      (res) => {
        // Das Plugin meldet Erfolg je nach Version unterschiedlich
        // ('ERROR_NONE', 'success', 'succeeded', teils auch ohne result-Feld).
        // Nur bei einem klar erkennbaren Fehler ablehnen.
        const r = String((res as any)?.result ?? res ?? '').toLowerCase();
        const ok = r === '' || r.includes('error_none') || r.includes('success') || r.includes('succeed');
        if (ok) resolve();
        else reject(new Error(String((res as any)?.result ?? 'Unbekannter Druckfehler')));
      },
      (e) => reject(new Error(e))
    );
  });
}

// Druckt eine Liste Items nativ. Gibt true zurück, wenn der native Weg
// genommen wurde (auch bei Fehler -> kein doppelter window.print-Fallback).
export async function tryPrintNative(
  items: LabelItem[],
  ownerName: string,
  cfg: BrotherPrinterConfig | null | undefined,
  origin: string,
  copies = 1
): Promise<boolean> {
  if (!canPrintNative(cfg)) return false;
  const plugin = getPlugin();
  if (!plugin) return false;

  try {
    await requestBluetoothPermissions(); // best-effort; ohne Recht kein BT-Zugriff
    await setPrinterAsync(plugin, cfg, copies);
    const lengthMm = cfg.labelLengthMm || DEFAULT_LABEL_LENGTH_MM;
    for (const item of items) {
      const encodedImage = await renderLabelToPng(item, ownerName, origin, lengthMm);
      await printImageAsync(plugin, encodedImage);
    }
  } catch (e) {
    console.error('Brother-Druck fehlgeschlagen:', e);
    alert('❌ Druck fehlgeschlagen: ' + (e as Error).message + '\nIst der Drucker eingeschaltet und gekoppelt?');
  }
  return true;
}

// Druckt ein Verleih-Etikett nativ (mit Eigentümer, Ausleiher, Rückgabedatum).
export async function tryPrintLoanNative(
  item: LabelItem,
  loan: LabelLoan,
  ownerName: string,
  cfg: BrotherPrinterConfig | null | undefined,
  origin: string
): Promise<boolean> {
  if (!canPrintNative(cfg)) return false;
  const plugin = getPlugin();
  if (!plugin) return false;

  try {
    await requestBluetoothPermissions();
    await setPrinterAsync(plugin, cfg, 1);
    const encodedImage = await renderLoanLabelToPng(item, loan, ownerName, origin);
    await printImageAsync(plugin, encodedImage);
  } catch (e) {
    console.error('Brother-Druck fehlgeschlagen:', e);
    alert('❌ Druck fehlgeschlagen: ' + (e as Error).message + '\nIst der Drucker eingeschaltet und gekoppelt?');
  }
  return true;
}

// Druckt Lagerort-Etiketten nativ (QR führt beim Scannen direkt zum Lagerort).
export async function tryPrintLocationsNative(
  locs: LabelLocation[],
  ownerName: string,
  cfg: BrotherPrinterConfig | null | undefined,
  origin: string,
  copies = 1
): Promise<boolean> {
  if (!canPrintNative(cfg)) return false;
  const plugin = getPlugin();
  if (!plugin) return false;

  try {
    await requestBluetoothPermissions();
    await setPrinterAsync(plugin, cfg, copies);
    const lengthMm = cfg.labelLengthMm || DEFAULT_LABEL_LENGTH_MM;
    for (const loc of locs) {
      const encodedImage = await renderLocationLabelToPng(loc, ownerName, origin, lengthMm);
      await printImageAsync(plugin, encodedImage);
    }
  } catch (e) {
    console.error('Brother-Druck fehlgeschlagen:', e);
    alert('❌ Druck fehlgeschlagen: ' + (e as Error).message + '\nIst der Drucker eingeschaltet und gekoppelt?');
  }
  return true;
}

// Sucht erreichbare Drucker (nur nativ). Mit Timeout, damit die Suche nie
// still hängt, falls das Plugin keine Callback aufruft.
export async function searchPrinters(
  port: BrotherPrinterConfig['port'] = 'BLUETOOTH',
  timeoutMs = 12000
): Promise<FoundPrinter[]> {
  const plugin = getPlugin();
  if (!isNativePrintAvailable() || !plugin) return [];

  return new Promise((resolve) => {
    let done = false;
    const finish = (r: FoundPrinter[]) => { if (!done) { done = true; resolve(r); } };
    const timer = setTimeout(() => finish([]), timeoutMs);
    const onOk = (printers: FoundPrinter[]) => { clearTimeout(timer); finish(printers || []); };
    const onErr = () => { clearTimeout(timer); finish([]); };
    try {
      if (port === 'NET') plugin.findNetworkPrinters(onOk, onErr);
      else plugin.findBluetoothPrinters(onOk, onErr);
    } catch {
      clearTimeout(timer);
      finish([]);
    }
  });
}
