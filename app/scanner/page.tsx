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
  
  // Ref-Trick für den Dropdown-Wert
  const selectedLocationRef = useRef(selectedLocation);
  useEffect(() => { selectedLocationRef.current = selectedLocation; }, [selectedLocation]);

  // UI States
  const [isProcessing, setIsProcessing] = useState(false);
  // Ref-Trick für isProcessing, damit die Kamera nicht bei jedem Rerender neu startet!
  const isProcessingRef = useRef(isProcessing);
  useEffect(() => { isProcessingRef.current = isProcessing; }, [isProcessing]);

  const [toastMessage, setToastMessage] = useState<{text: string, type: 'success' | 'info' | 'error'} | null>(null);
  const [unknownEan, setUnknownEan] = useState<string | null>(null);
  
  // DER KAMERA-RESTART-KEY
  const [scannerKey, setScannerKey] = useState(0); 

  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper-Funktion: Lagerorte hierarchisch einrücken
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

  // Lagerorte laden und formatieren
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

  // KAMERA INITIALISIERUNG (Wird durch scannerKey komplett neu gestartet, wenn nötig)
  useEffect(() => {
    if (!workspaceId) return; 

    // Vorherige Instanz sauber aufräumen
    if (scannerRef.current) {
      scannerRef.current.clear().catch(e => console.error(e));
      scannerRef.current = null;
    }

    scannerRef.current = new Html5QrcodeScanner(
      "reader", 
      { fps: 10, qrbox: { width: 250, height: 250 }, rememberLastUsedCamera: true },
      false
    );

    scannerRef.current.render(
      async (decodedText) => {
        // Nutzen den Ref, um React Re-Renders zu umgehen
        if (isProcessingRef.current) return; 
        
        setIsProcessing(true);
        setUnknownEan(null);
        showToast("Prüfe Datenbank...", "info", 10000);

        try {
          // 1. IST ES EIN LAGERORT (QR-Code)?
          const locQuery = query(collection(db, 'workspaces', workspaceId, 'locations'), where('code', '==', decodedText));
          const locSnap = await getDocs(locQuery);
          if (!locSnap.empty) {
            scannerRef.current?.clear();
            router.push(`/?scannedLoc=${locSnap.docs[0].id}`); 
            return;
          }

          // 2. EXISTIERT DAS ITEM BEREITS?
          const itemQ = query(collection(db, 'workspaces', workspaceId, 'items'), where('ean', '==', decodedText));
          const querySnapshot = await getDocs(itemQ);
          if (!querySnapshot.empty) {
            scannerRef.current?.clear();
            router.push(`/item/${querySnapshot.docs[0].id}/edit`); 
            return;
          }

          // 3. FLIESSBAND-MODUS: NEUES ITEM IM NETZ SUCHEN!
          showToast("Suche Produktdaten im Netz...", "info", 10000);
          
          const res = await fetch('/api/search-ean', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ean: decodedText.trim() })
          });
          
          const data = await res.json();

          if (res.ok && data.title) {
            // ERFOLG!
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
            
            showToast(`✅ ${data.title.split('|')[0].substring(0, 25)}... gespeichert!`, 'success');
            setTimeout(() => setIsProcessing(false), 2000);

          } else {
            // FEHLSCHLAG: Kamera hat nichts gefunden
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

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(e => console.error(e));
        scannerRef.current = null;
      }
    };
  // WICHTIG: scannerKey sorgt dafür, dass dieser Effekt nach einem Foto komplett neu läuft!
  }, [workspaceId, router, scannerKey]); 

  // FOTO-FALLBACK
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
        ean: unknownEan || '', 
        imageUrl: downloadUrl,
        category: '', 
        quantity: 1,
        locationId: selectedLocationRef.current,
        createdAt: new Date().toISOString()
      });

      showToast(`✅ Foto gespeichert! Ab in den Korb.`, 'success');
      setUnknownEan(null);
      
      // HIER PASSIERT DIE MAGIE: Wir zwingen die Kamera zum kompletten Reboot!
      setTimeout(() => {
        setIsProcessing(false);
        setScannerKey(prev => prev + 1); 
      }, 1500);

    } catch (error) {
      alert("Fehler beim Hochladen des Bildes.");
      setIsProcessing(false);
      setScannerKey(prev => prev + 1); // Auch bei Fehler neustarten
    }
  };

  const cancelFallback = () => {
    setUnknownEan(null);
    setScannerKey(prev => prev + 1); // Reboot, um das Bild wieder live zu schalten
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
        
        {/* Der Scanner-Container nutzt den scannerKey, um nach einem Foto komplett neu gerendert zu werden */}
        <div key={scannerKey} className="w-full max-w-md overflow-hidden rounded-3xl relative z-10">
           <div id="reader" className="w-full bg-black"></div>
        </div>

        {/* Overlay, wenn unbekannte EAN oder Upload lädt */}
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