"use client";

import { useEffect, useState, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useWorkspace } from '../../context/WorkspaceContext'; // <--- NEU: Wächter importiert

export default function Scanner() {
  const router = useRouter();
  const { workspaceId } = useWorkspace(); // <--- NEU: Workspace ID abrufen
  
  const [scanResult, setScanResult] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Kamera wird gestartet...");
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    // Stopp, wenn der Workspace noch nicht geladen ist
    if (!workspaceId) return; 

    if (!scannerRef.current) {
      scannerRef.current = new Html5QrcodeScanner(
        "reader", 
        { fps: 10, qrbox: { width: 250, height: 250 }, rememberLastUsedCamera: true },
        false
      );

      scannerRef.current.render(
        async (decodedText) => {
          console.log("Scanner hat exakt diesen Code gelesen:", decodedText);
          
          if (scannerRef.current) {
            scannerRef.current.clear();
          }
          setScanResult(decodedText);
          setIsProcessing(true);
          setStatusMessage("Prüfe Datenbank...");

          try {
            // 1. Prüfen, ob der Code ein LAGERORT ist
            const locQuery = query(collection(db, 'workspaces', workspaceId, 'locations'), where('code', '==', decodedText));
            const locSnap = await getDocs(locQuery);
            
            if (!locSnap.empty) {
              setStatusMessage("Lagerort gefunden!");
              const locId = locSnap.docs[0].id;
              router.push(`/?scannedLoc=${locId}`); 
              return;
            }

            // 2. Prüfen, ob der Code ein ITEM-BARCODE (EAN) ist
            const itemQ = query(collection(db, 'workspaces', workspaceId, 'items'), where('ean', '==', decodedText));
            const querySnapshot = await getDocs(itemQ);
            
            if (!querySnapshot.empty) {
              setStatusMessage("Item gefunden!");
              const existingItem = querySnapshot.docs[0];
              router.push(`/item/${existingItem.id}`); 
              return;
            }

            // 3. Nichts gefunden -> Wir fragen das globale Internet!
            setStatusMessage("Suche im globalen Netz...");
            try {
              const res = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${decodedText}`);
              const data = await res.json();
              
              if (data && data.items && data.items.length > 0) {
                const globalName = data.items[0].title;
                setStatusMessage(`Gefunden: ${globalName.substring(0, 20)}...`);
                router.push(`/new?ean=${decodedText}&name=${encodeURIComponent(globalName)}`);
                return;
              }
            } catch (e) {
              console.log("Globale API nicht erreichbar oder Item unbekannt.");
            }

            // 4. Absolut nichts gefunden -> Leeres neues Item
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
  }, [router, workspaceId]); // <--- NEU: workspaceId als Abhängigkeit hinzugefügt

  // Bevor die Kamera startet, sicherstellen, dass wir eine ID haben
  if (!workspaceId) {
    return <div className="min-h-screen bg-slate-50 p-8 text-center text-slate-500">Lade Scanner...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-md mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-slate-800">Scanner</h1>
          <Link href="/" className="text-sm font-bold text-slate-500 hover:text-slate-800 transition">Abbrechen</Link>
        </div>

        {scanResult && !isProcessing ? (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-orange-200 text-center animate-fade-in">
            <div className="w-16 h-16 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">📦</div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Neuer Code erkannt!</h2>
            <p className="text-slate-600 mb-6 bg-slate-50 p-3 rounded-xl font-mono text-sm break-all border border-slate-200 shadow-inner">
              Gelesener Code: {scanResult}
            </p>
            <p className="text-sm font-medium text-slate-500 mb-6">Dieses Item existiert noch nicht in deiner Werkstatt.</p>
            
            <button onClick={() => router.push(`/new?ean=${scanResult}`)} className="w-full bg-orange-600 text-white font-bold py-3.5 rounded-xl hover:bg-orange-700 transition shadow-md mb-3">
              Neues Item damit anlegen
            </button>
            <button onClick={() => window.location.reload()} className="w-full bg-white border border-slate-300 text-slate-700 font-bold py-3.5 rounded-xl hover:bg-slate-50 transition shadow-sm">
              Erneut scannen
            </button>
          </div>
        ) : (
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 relative">
            <div id="reader" className="w-full rounded-xl overflow-hidden"></div>
            <div className="absolute bottom-6 left-0 right-0 text-center">
              <span className="bg-slate-900/90 text-white px-5 py-2.5 rounded-full text-xs font-bold shadow-lg backdrop-blur-md">
                {statusMessage}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}