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
  
  const selectedLocationRef = useRef(selectedLocation);
  useEffect(() => { selectedLocationRef.current = selectedLocation; }, [selectedLocation]);

  // UI States
  const [isProcessing, setIsProcessing] = useState(false);
  const isProcessingRef = useRef(isProcessing);
  useEffect(() => { isProcessingRef.current = isProcessing; }, [isProcessing]);

  const [toastMessage, setToastMessage] = useState<{text: string, type: 'success' | 'info' | 'error'} | null>(null);
  const [unknownEan, setUnknownEan] = useState<string | null>(null);
  
  // 🔥 NEU: Dieser State kontrolliert, ob der Scanner überhaupt im HTML existiert
  const [showScanner, setShowScanner] = useState(true); 

  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const buildLocationTree = (locationsList: any[], parentId: string | null = null, level = 0): any[] => {
    return locationsList
      .filter(loc => (loc.parentId || null) === parentId)
      .sort((a, b) => a.name.localeCompare(b.name))
      .reduce((acc, loc) => {
        const prefix = level > 0 ? '—'.repeat(level) + ' ' : '';
        acc.push({ ...loc, displayName: prefix + loc.name });
        acc.push(...buildLocationTree(locationsList, loc.id, level + 1));
        return acc;
      }, []);
  };

  useEffect(() => {
    if (!workspaceId) return;
    const fetchLocations = async () => {
      const locSnapshot = await getDocs(collection(db, 'workspaces', workspaceId, 'locations'));
      const rawLocs: any[] = [];
      locSnapshot.forEach((doc) => { rawLocs.push({ id: doc.id, ...doc.data() }); });
      setLocations(buildLocationTree(rawLocs));
    };
    fetchLocations();
  }, [workspaceId]);

  const showToast = (text: string, type: 'success' | 'info' | 'error', duration = 3000) => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), duration);
  };

  // 🔥 KAMERA INITIALISIERUNG: Läuft nur, wenn showScanner = true ist!
  useEffect(() => {
    if (!workspaceId || !showScanner) return; 

    const scanner = new Html5QrcodeScanner(
      "reader", 
      { fps: 10, qrbox: { width: 250, height: 250 }, rememberLastUsedCamera: true },
      false
    );

    scanner.render(
      async (decodedText) => {
        if (isProcessingRef.current) return; 
        
        setIsProcessing(true);
        setUnknownEan(null);
        showToast("Prüfe Datenbank...", "info", 10000);

        try {
          // 1. LAGERORT
          const locQuery = query(collection(db, 'workspaces', workspaceId, 'locations'), where('code', '==', decodedText));
          const locSnap = await getDocs(locQuery);
          if (!locSnap.empty) {
            scanner.clear();
            router.push(`/?scannedLoc=${locSnap.docs[0].id}`); 
            return;
          }

          // 2. ITEM EXISTIERT
          const itemQ = query(collection(db, 'workspaces', workspaceId, 'items'), where('ean', '==', decodedText));
          const querySnapshot = await getDocs(itemQ);
          if (!querySnapshot.empty) {
            scanner.clear();
            router.push(`/item/${querySnapshot.docs[0].id}/edit`); 
            return;
          }

          // 3. FLIESSBAND (Suche im Netz)
          showToast("Suche in globalen Datenbanken...", "info", 10000);
          
          const res = await fetch('/api/search-ean', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ean: decodedText.trim() })
          });
          
          const data = await res.json();

          if (res.ok && data.title) {
            await addDoc(collection(db, 'workspaces', workspaceId, 'items'), {
              name: data.title.split('|')[0].trim(),
              ean: decodedText,
              productUrl: data.url || '',
              imageUrl: data.imageUrl || '',
              category: '', 
              quantity: 1,
              locationId: selectedLocationRef.current,
              createdAt: new Date().toISOString()
            });
            
            showToast(`✅ ${data.title.substring(0, 25)}... gespeichert!`, 'success');
            setTimeout(() => setIsProcessing(false), 2000);

          } else {
            setUnknownEan(decodedText);
            showToast(`❌ EAN unbekannt. Bitte knipse ein Foto!`, 'error', 5000);
            setIsProcessing(false); 
          }

        } catch (error) {
          setUnknownEan(decodedText);
          showToast(`❌ Verbindungsfehler. Bitte knipse ein Foto!`, 'error', 5000);
          setIsProcessing(false);
        }
      },
      (error) => {}
    );

    scannerRef.current = scanner;

    // Cleanup: Zerstört den Scanner komplett, wenn showScanner auf false geht
    return () => {
      scanner.clear().catch(e => console.error(e));
      scannerRef.current = null;
    };
  }, [workspaceId, router, showScanner]); 

  // 🔥 DER TÜRSTEHER: Zerstört die Kamera BEVOR die native Foto-App aufgeht
  const triggerPhoto = () => {
    // 1. Barcode-Scanner aus dem HTML entfernen und Kamera freigeben
    setShowScanner(false);
    
    // 2. Kurz warten, bis das OS die Hardware losgelassen hat, dann Foto-App öffnen
    setTimeout(() => {
      fileInputRef.current?.click();
    }, 200);
  };

  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    
    // Falls der User in der Foto-App auf "Abbrechen" drückt, Kamera wieder starten
    if (!file) {
      setShowScanner(true);
      return;
    }

    if (!workspaceId) return;

    setIsProcessing(true);
    showToast("📸 Lade Foto hoch...", "info", 10000);

    try {
      const storageRef = ref(storage, `workspaces/${workspaceId}/items/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(storageRef);

      await addDoc(collection(db, 'workspaces', workspaceId, 'items'), {
        name: unknownEan ? `Unbekannt (${unknownEan})` : 'Neues Foto-Item',
        ean: unknownEan || '', 
        imageUrl: downloadUrl,
        category: '', 
        quantity: 1,
        locationId: selectedLocationRef.current,
        createdAt: new Date().toISOString()
      });

      showToast(`✅ Foto gespeichert! Ab in den Korb.`, 'success');
      setUnknownEan(null);
      
    } catch (error) {
      alert("Fehler beim Hochladen des Bildes.");
    } finally {
      setIsProcessing(false);
      // 🔥 EGAL OB ERFOLG ODER FEHLER: Jetzt bauen wir die Kamera frisch auf!
      setTimeout(() => setShowScanner(true), 500);
    }
  };

  const cancelFallback = () => {
    setUnknownEan(null);
    setShowScanner(false);
    setTimeout(() => setShowScanner(true), 100); // Schneller Reboot
  };

  if (!workspaceId) return <div className="min-h-screen bg-slate-900 p-8 text-center text-white">Lade Scanner...</div>;

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col relative">
      
      {/* HEADER */}
      <div className="p-4 bg-slate-800 border-b border-slate-700 flex justify-between items-center z-20">
        <div className="flex-1">
          <label className="text-[10px] uppercase text-slate-400 font-bold block mb-1">Vorab-Zuweisung (Optional)</label>
          <select 
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
            className="w-full bg-slate-700 text-white text-sm p-2 rounded-lg border border-slate-600 outline-none focus:border-orange-500 font-mono"
          >
            <option value="">Lagerort: Nicht zugewiesen</option>
            {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.displayName}</option>)}
          </select>
        </div>
        <Link href="/" className="ml-4 w-10 h-10 bg-slate-700 rounded-full flex items-center justify-center text-xl hover:bg-slate-600 transition">
          ✖️
        </Link>
      </div>

      {/* TOAST MELDUNGEN */}
      {toastMessage && (
        <div className={`absolute top-24 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full shadow-2xl font-bold text-sm z-50 whitespace-nowrap border ${
          toastMessage.type === 'success' ? 'bg-green-500/90 border-green-400 text-white' : 
          toastMessage.type === 'error' ? 'bg-red-500/90 border-red-400 text-white animate-pulse' : 
          'bg-slate-800 border-slate-600 text-white'
        }`}>
          {toastMessage.text}
        </div>
      )}

      {/* KAMERA BEREICH */}
      <div className="flex-1 relative flex flex-col items-center justify-center bg-black">
        
        {/* 🔥 Der Reader wird nur ins HTML gehängt, wenn showScanner true ist! */}
        {showScanner ? (
          <div className="w-full max-w-md overflow-hidden rounded-3xl relative z-10">
             <div id="reader" className="w-full bg-black"></div>
          </div>
        ) : (
          <div className="w-full max-w-md h-64 flex items-center justify-center border border-slate-700 rounded-3xl bg-slate-800">
             <span className="text-slate-500 animate-pulse">Kamera wird neu gestartet...</span>
          </div>
        )}

        {/* Overlay */}
        {(unknownEan || (isProcessing && !unknownEan)) && (
          <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-md z-20 flex flex-col items-center justify-center p-6 text-center">
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

      {/* BOTTOM CONTROLS */}
      <div className="p-8 bg-slate-800 flex flex-col items-center pb-12 z-20">
        <input 
          type="file" 
          accept="image/*" 
          capture="environment" 
          ref={fileInputRef}
          onChange={handlePhotoCapture}
          className="hidden" 
        />
        
        {/* 🔥 Der Foto-Button ruft jetzt triggerPhoto() auf, was die Kamera sicher beendet! */}
        <button 
          onClick={triggerPhoto}
          className={`w-20 h-20 rounded-full border-4 flex items-center justify-center text-3xl shadow-2xl transition-transform active:scale-90 ${
            unknownEan ? 'bg-orange-500 border-orange-200 animate-pulse' : 'bg-slate-700 border-slate-500 hover:bg-slate-600'
          }`}
        >
          📷
        </button>
        <p className="text-xs text-slate-400 font-bold mt-4 uppercase tracking-wider">
          {unknownEan ? 'Foto als Fallback machen' : 'Ohne Barcode knipsen'}
        </p>
        
        {unknownEan && (
          <button 
            onClick={cancelFallback}
            className="mt-6 text-sm text-slate-500 underline"
          >
            Abbrechen & Kamera neu starten
          </button>
        )}
      </div>
    </div>
  );
}