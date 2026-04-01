"use client";

import { useEffect, useState, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { db, storage } from '../../lib/firebase';
import { collection, query, where, getDocs, addDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useWorkspace } from '../../context/WorkspaceContext';

export default function SuperScanner() {
  const router = useRouter();
  const { workspaceId } = useWorkspace();
  
  const [locations, setLocations] = useState<any[]>([]);
  const [selectedLocation, setSelectedLocation] = useState('');
  
  // Da der html5-qrcode Scanner außerhalb des React-Lifecycles lebt, 
  // müssen wir den ausgewählten Lagerort in einem Ref speichern, damit die Kamera ihn immer aktuell kennt!
  const selectedLocationRef = useRef(selectedLocation);
  useEffect(() => { selectedLocationRef.current = selectedLocation; }, [selectedLocation]);

  // UI States
  const [isProcessing, setIsProcessing] = useState(false);
  const [toastMessage, setToastMessage] = useState<{text: string, type: 'success' | 'info' | 'error'} | null>(null);
  const [unknownEan, setUnknownEan] = useState<string | null>(null);
  
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Lagerorte für das Dropdown laden
  useEffect(() => {
    if (!workspaceId) return;
    const fetchLocations = async () => {
      const locSnapshot = await getDocs(collection(db, 'workspaces', workspaceId, 'locations'));
      const locs: any[] = [];
      locSnapshot.forEach((doc) => { locs.push({ id: doc.id, ...doc.data() }); });
      setLocations(locs);
    };
    fetchLocations();
  }, [workspaceId]);

  const showToast = (text: string, type: 'success' | 'info' | 'error', duration = 3000) => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), duration);
  };

  // KAMERA INITIALISIERUNG
  useEffect(() => {
    if (!workspaceId) return; 

    if (!scannerRef.current) {
      scannerRef.current = new Html5QrcodeScanner(
        "reader", 
        { fps: 10, qrbox: { width: 250, height: 250 }, rememberLastUsedCamera: true },
        false
      );

      scannerRef.current.render(
        async (decodedText) => {
          // Wenn wir gerade etwas verarbeiten oder ein Foto verlangen, ignoriere neue Scans
          if (isProcessing) return; 
          
          setIsProcessing(true);
          setUnknownEan(null);
          showToast("Prüfe Datenbank...", "info", 10000); // Bleibt stehen, bis wir fertig sind

          try {
            // 1. IST ES EIN LAGERORT (QR-Code)?
            const locQuery = query(collection(db, 'workspaces', workspaceId, 'locations'), where('code', '==', decodedText));
            const locSnap = await getDocs(locQuery);
            if (!locSnap.empty) {
              const locId = locSnap.docs[0].id;
              scannerRef.current?.clear();
              router.push(`/?scannedLoc=${locId}`); 
              return;
            }

            // 2. EXISTIERT DAS ITEM BEREITS?
            const itemQ = query(collection(db, 'workspaces', workspaceId, 'items'), where('ean', '==', decodedText));
            const querySnapshot = await getDocs(itemQ);
            if (!querySnapshot.empty) {
              const existingItem = querySnapshot.docs[0];
              scannerRef.current?.clear();
              router.push(`/item/${existingItem.id}/edit`); 
              return;
            }

            // 3. FLIESSBAND-MODUS: NEUES ITEM IM NETZ SUCHEN!
            showToast("Suche Produktdaten...", "info", 10000);
            
            const res = await fetch('/api/search-ean', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ean: decodedText.trim(), shops: ["galaxus.ch", "hornbach.ch", "obi.ch", "brack.ch"] })
            });
            
            const data = await res.json();

            if (res.ok && data.url) {
              // ERFOLG! Blind in den Eingangskorb speichern
              await addDoc(collection(db, 'workspaces', workspaceId, 'items'), {
                name: data.title.split('|')[0].trim(),
                ean: decodedText, // EAN für die spätere globale Datenbank speichern!
                productUrl: data.url,
                imageUrl: data.imageUrl,
                category: '', // Bleibt leer = Eingangskorb!
                quantity: 1,
                locationId: selectedLocationRef.current, // Holt den aktuellen Dropdown-Wert
                createdAt: new Date().toISOString()
              });
              
              showToast(`✅ ${data.title.split('|')[0].substring(0, 25)}... gespeichert!`, 'success');
              
              // Kurze Pause, dann Kamera wieder scharf schalten für das nächste Item!
              setTimeout(() => setIsProcessing(false), 2000);

            } else {
              // FEHLSCHLAG: Nichts gefunden. Wir brauchen ein Foto!
              setUnknownEan(decodedText);
              showToast(`❌ EAN unbekannt. Bitte knipse ein Foto!`, 'error', 5000);
              setIsProcessing(false); // Kamera darf im Hintergrund weiterlaufen, aber UI blockiert
            }

          } catch (error) {
            console.error("Fehler beim Prüfen:", error);
            setUnknownEan(decodedText);
            showToast(`❌ Verbindungsfehler. Bitte knipse ein Foto!`, 'error', 5000);
            setIsProcessing(false);
          }
        },
        (error) => {
          // Ignoriere die ständigen "Kein Barcode gefunden" Fehler des Scanners
        }
      );
    }

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(e => console.error(e));
      }
    };
  }, [workspaceId, router, isProcessing]);

  // FOTO-FALLBACK (Für Rasenmäher ODER unbekannte EANs)
  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !workspaceId) return;

    setIsProcessing(true);
    showToast("📸 Lade Foto hoch...", "info", 10000);

    try {
      const storageRef = ref(storage, `workspaces/${workspaceId}/items/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(storageRef);

      await addDoc(collection(db, 'workspaces', workspaceId, 'items'), {
        name: unknownEan ? `Unbekannt (${unknownEan})` : 'Neues Foto-Item',
        ean: unknownEan || '', // Nimmt die EAN mit, falls wir vorhin eine gescannt haben
        imageUrl: downloadUrl,
        category: '', 
        quantity: 1,
        locationId: selectedLocationRef.current,
        createdAt: new Date().toISOString()
      });

      showToast(`✅ Foto gespeichert! Ab in den Korb.`, 'success');
      setUnknownEan(null); // Reset, damit die Kamera wieder Barcodes annimmt
      setTimeout(() => setIsProcessing(false), 2000);

    } catch (error) {
      alert("Fehler beim Hochladen des Bildes.");
      setIsProcessing(false);
    }
  };

  if (!workspaceId) return <div className="min-h-screen bg-slate-900 p-8 text-center text-white">Lade Scanner...</div>;

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col relative">
      
      {/* 1. HEADER: Vorab-Zuweisung */}
      <div className="p-4 bg-slate-800 border-b border-slate-700 flex justify-between items-center z-20">
        <div className="flex-1">
          <label className="text-[10px] uppercase text-slate-400 font-bold block mb-1">Vorab-Zuweisung (Optional)</label>
          <select 
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
            className="w-full bg-slate-700 text-white text-sm p-2 rounded-lg border border-slate-600 outline-none focus:border-orange-500"
          >
            <option value="">Lagerort: Nicht zugewiesen</option>
            {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
          </select>
        </div>
        <Link href="/" className="ml-4 w-10 h-10 bg-slate-700 rounded-full flex items-center justify-center text-xl hover:bg-slate-600 transition">
          ✖️
        </Link>
      </div>

      {/* 2. TOAST MELDUNGEN */}
      {toastMessage && (
        <div className={`absolute top-24 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full shadow-2xl font-bold text-sm z-50 whitespace-nowrap border ${
          toastMessage.type === 'success' ? 'bg-green-500/90 border-green-400 text-white' : 
          toastMessage.type === 'error' ? 'bg-red-500/90 border-red-400 text-white animate-pulse' : 
          'bg-slate-800 border-slate-600 text-white'
        }`}>
          {toastMessage.text}
        </div>
      )}

      {/* 3. KAMERA BEREICH */}
      <div className="flex-1 relative flex flex-col items-center justify-center bg-black">
        
        {/* Der html5-qrcode Container */}
        <div className="w-full max-w-md overflow-hidden rounded-3xl relative z-10">
           <div id="reader" className="w-full bg-black"></div>
        </div>

        {/* Overlay, wenn unbekannte EAN oder Upload lädt */}
        {(unknownEan || (isProcessing && !unknownEan)) && (
          <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm z-20 flex flex-col items-center justify-center p-6 text-center">
            {unknownEan ? (
              <div className="animate-fade-in">
                <div className="text-5xl mb-4">📸</div>
                <h2 className="text-xl font-bold text-white mb-2">EAN nicht gefunden!</h2>
                <p className="text-slate-300 text-sm mb-6 bg-slate-800 p-3 rounded-lg border border-slate-700 font-mono">
                  Code: {unknownEan}
                </p>
                <p className="text-orange-400 font-bold text-sm mb-8">
                  Bitte knipse kurz ein Foto des Artikels, damit du ihn später im Eingangskorb erkennst.
                </p>
              </div>
            ) : (
              <div className="animate-spin text-5xl">⏳</div>
            )}
          </div>
        )}
      </div>

      {/* 4. BOTTOM CONTROLS (Foto knipsen) */}
      <div className="p-8 bg-slate-800 flex flex-col items-center pb-12 z-20">
        <input 
          type="file" 
          accept="image/*" 
          capture="environment" 
          ref={fileInputRef}
          onChange={handlePhotoCapture}
          className="hidden" 
        />
        
        <button 
          onClick={() => fileInputRef.current?.click()}
          className={`w-20 h-20 rounded-full border-4 flex items-center justify-center text-3xl shadow-2xl transition-transform active:scale-90 ${
            unknownEan ? 'bg-orange-500 border-orange-200 animate-pulse' : 'bg-slate-700 border-slate-500 hover:bg-slate-600'
          }`}
        >
          📷
        </button>
        <p className="text-xs text-slate-400 font-bold mt-4 uppercase tracking-wider">
          {unknownEan ? 'Foto als Fallback machen' : 'Ohne Barcode knipsen'}
        </p>
        
        {/* Abbruch-Button, wenn wir im EAN-Fallback stecken */}
        {unknownEan && (
          <button 
            onClick={() => setUnknownEan(null)}
            className="mt-6 text-sm text-slate-500 underline"
          >
            Abbrechen & weiter scannen
          </button>
        )}
      </div>
    </div>
  );
}