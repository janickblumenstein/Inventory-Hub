// Brother-Druck-Adapter (Capacitor + Brother Print SDK).
//
// ⚠️ Alle Brother-/Plugin-spezifischen Details leben NUR hier. Falls Du ein
// anderes Plugin nimmst oder die Enum-Werte (Modell/Tape) abweichen, musst Du
// ausschließlich diese Datei anpassen.
//
// Der native Teil (Bluetooth-Druck an den Cube) läuft nur in der Android-App
// (Capacitor). Im PC-/iPhone-Browser ist isNativePrintAvailable() = false und
// die App fällt automatisch auf window.print() zurück.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { renderLabelToPng, type LabelItem } from './labelImage';

// Konfiguration des gekoppelten Druckers (in den Settings gespeichert).
export type BrotherPrinterConfig = {
  model: string;        // z.B. 'PT_P710BT' – muss zum Plugin-Enum passen (auf dem Gerät verifizieren)
  labelName: string;    // Tape-Größe, z.B. der 24mm-Wert des Plugins
  port: 'bluetooth' | 'bluetoothLowEnergy' | 'wifi' | 'usb';
  channelInfo: string;  // Bluetooth: MAC-Adresse, WLAN: IP
};

// Minimales Interface des nativen Plugins (registriert unter dem Namen "BrotherPrint").
interface BrotherPrintPlugin {
  printImage(options: {
    encodedImage: string;
    modelName: string;
    labelName: string;
    port: string;
    channelInfo: string;
    numberOfCopies?: number;
    autoCut?: boolean;
  }): Promise<void>;
  search(options?: { port?: string; searchDuration?: number }): Promise<void>;
  addListener(
    eventName: string,
    listener: (data: any) => void
  ): Promise<{ remove: () => void }>;
}

const BrotherPrint = registerPlugin<BrotherPrintPlugin>('BrotherPrint');

// Läuft die App nativ (Android/iOS via Capacitor)? Nur dann ist BT-Druck möglich.
export function isNativePrintAvailable(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

// Ist ein Drucker konfiguriert und nativer Druck möglich?
export function canPrintNative(cfg?: BrotherPrinterConfig | null): cfg is BrotherPrinterConfig {
  return isNativePrintAvailable() && !!cfg && !!cfg.channelInfo && !!cfg.model;
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

  try {
    for (const item of items) {
      const encodedImage = await renderLabelToPng(item, ownerName, origin);
      await BrotherPrint.printImage({
        encodedImage,
        modelName: cfg.model,
        labelName: cfg.labelName,
        port: cfg.port,
        channelInfo: cfg.channelInfo,
        numberOfCopies: copies,
        autoCut: true,
      });
    }
  } catch (e) {
    console.error('Brother-Druck fehlgeschlagen:', e);
    alert('❌ Druck fehlgeschlagen. Ist der Drucker eingeschaltet und gekoppelt?');
  }
  return true;
}

// Sucht gekoppelte/erreichbare Drucker (nur nativ). Best-effort – die genaue
// Event-Struktur des Plugins bitte auf dem Gerät verifizieren/anpassen.
export type FoundPrinter = { modelName?: string; channelInfo?: string; [k: string]: any };

export async function searchPrinters(
  port: BrotherPrinterConfig['port'] = 'bluetooth',
  durationMs = 8000
): Promise<FoundPrinter[]> {
  if (!isNativePrintAvailable()) return [];

  const found: FoundPrinter[] = [];
  const handle = await BrotherPrint.addListener('onPrinterAvailable', (data: any) => {
    if (data) found.push(data);
  });

  try {
    await BrotherPrint.search({ port, searchDuration: Math.ceil(durationMs / 1000) });
    await new Promise((r) => setTimeout(r, durationMs));
  } catch (e) {
    console.error('Druckersuche fehlgeschlagen:', e);
  } finally {
    handle.remove();
  }
  return found;
}
