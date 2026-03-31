"use client";

import { useEffect, useState, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function Scanner() {
  const router = useRouter();
  const [scanResult, setScanResult] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Kamera wird gestartet...");
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    // Verhindert doppeltes Laden im React Strict Mode
    if (!scannerRef.current) {
      scannerRef.current = new Html5QrcodeScanner(
        "reader", 
        { fps: 10, qrbox: { width: 250, height: 250 }, rememberLastUsedCamera: true },
        false
      );

      scannerRef.current.render(
        async (decodedText) => {
          // 1. Kamera sofort anhalten, wenn ein Code gefunden wurde!
          if (scannerRef.current) {
            scannerRef.current.clear();
          }
          setScanResult(decodedText);
          setIsProcessing(true);
          setStatusMessage("Prüfe Datenbank...");

          try {
            // CHECK 1: Ist es ein Lagerort-Code? (Für die Zukunft)
            const locRef = doc(db, 'locations', decodedText);
            const locSnap = await getDoc(locRef);
            if (locSnap.exists()) {
              setStatusMessage("Lagerort gefunden!");
              router.push(`/?location=${decodedText}`); // Später bauen wir hier einen Filter ein
              return;
            }

            // CHECK 2: Ist es ein EAN-Code von einem bekannten Item?
            const q = query(collection(db, 'items'), where('ean', '==', decodedText));
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) {
              setStatusMessage("Item gefunden!");
              const existingItem = querySnapshot.docs[0];
              router.push(`/item/${existingItem.id}`); // Springt direkt zum Werkzeug!
              return;
            }

            // CHECK 3: Unbekannter Code! (Neues Item)
            setStatusMessage("Unbekannter Barcode.");
            setIsProcessing(false);

          } catch (error) {
            console.error("Fehler beim Prüfen:", error);
            setStatusMessage("Fehler bei der Datenbank-Abfrage.");
            setIsProcessing(false);
          }
        },
        (error) => {
          setStatusMessage("Suche nach Barcode/QR-Code...");
        }
      );
    }

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(e => console.error(e));
      }
    };
  }, [router]);

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-md mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-slate-800">Scanner</h1>
          <Link href="/" className="text-sm font-medium text-slate-500 hover:text-slate-800">Abbrechen</Link>
        </div>

        {scanResult && !isProcessing ? (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-orange-200 text-center animate-fade-in">
            <div className="w-16 h-16 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">📦</div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Neuer Code erkannt!</h2>
            <p className="text-slate-600 mb-6 bg-slate-50 p-3 rounded-lg font-mono text-sm break-all">
              EAN: {scanResult}
            </p>
            <p className="text-sm text-slate-500 mb-6">Dieses Item existiert noch nicht in deiner Werkstatt.</p>
            
            {/* Hier übergeben wir den EAN-Code in der URL! */}
            <button onClick={() => router.push(`/new?ean=${scanResult}`)} className="w-full bg-orange-600 text-white font-bold py-3 rounded-lg hover:bg-orange-700 transition mb-3">
              Neues Item damit anlegen
            </button>
            <button onClick={() => window.location.reload()} className="w-full bg-slate-200 text-slate-800 font-bold py-3 rounded-lg hover:bg-slate-300 transition">
              Erneut scannen
            </button>
          </div>
        ) : (
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 relative">
            <div id="reader" className="w-full rounded-lg overflow-hidden"></div>
            {/* Overlay-Nachricht */}
            <div className="absolute bottom-4 left-0 right-0 text-center">
              <span className="bg-slate-800/80 text-white px-4 py-2 rounded-full text-sm backdrop-blur-sm">
                {statusMessage}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}