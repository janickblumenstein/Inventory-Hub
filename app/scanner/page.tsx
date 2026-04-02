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

  const [isProcessing, setIsProcessing] = useState(false);
  const isProcessingRef = useRef(isProcessing);
  useEffect(() => { isProcessingRef.current = isProcessing; }, [isProcessing]);

  const [toastMessage, setToastMessage] = useState<{text: string, type: 'success' | 'info' | 'error'} | null>(null);
  const [unknownEan, setUnknownEan] = useState<string | null>(null);
  
  // 🔥 NEU: Unser Fallback-Status (Welches Menü wird gezeigt?)
  const [fallbackMode, setFallbackMode] = useState<'none' | 'menu' | 'photo'>('none');
  const [pastedUrl, setPastedUrl] = useState('');
  const [showScanner, setShowScanner] = useState(true); 

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper für saubere Lagerort-Einrückung
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

  // KAMERA INITIALISIERUNG
  useEffect(() => {
    if (!workspaceId || !showScanner) return; 

    const scanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: { width: 250, height: 250 }, rememberLastUsedCamera: true }, false);

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

          // 3. FLIESSBAND (Suche in gratis APIs)
          showToast("Suche in globalen Datenbanken...", "info", 10000);
          
          const res = await fetch('/api/search-ean', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ean: decodedText.trim() })
          });
          
          const data = await res.json();

          if (res.ok && data.title) {
            await addDoc(collection(db, 'workspaces', workspaceId, 'items'), {
              name: data.title,
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
            // 🔥 Nichts gefunden! Wir öffnen das smarte Fallback-Menü!
            setUnknownEan(decodedText);
            setFallbackMode('menu');
            setShowScanner(false); // Kamera temporär ausblenden, um Platz zu machen
            setToastMessage(null);
            setIsProcessing(false); 
          }

        } catch (error) {
          setUnknownEan(decodedText);
          setFallbackMode('menu');
          setShowScanner(false);
          setToastMessage(null);
          setIsProcessing(false);
        }
      },
      (error) => {}
    );

    return () => { scanner.clear().catch(e => console.error(e)); };
  }, [workspaceId, router, showScanner]); 

  // 🔥 NEU: URL verarbeiten (Meta-Daten ziehen)
  const handleUrlSubmit = async () => {
    if (!pastedUrl || !workspaceId) return;
    
    setIsProcessing(true);
    showToast("🔍 Lade Daten vom Shop...", "info", 10000);

    try {
      // Deinen bestehenden Meta-Scraper aufrufen!
      const metaRes = await fetch('/api/fetch-meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: pastedUrl })
      });
      const metaData = await metaRes.json();

      await addDoc(collection(db, 'workspaces', workspaceId, 'items'), {
        name: metaData.title || `Neues Item (${unknownEan})`,
        ean: unknownEan || '',
        productUrl: pastedUrl,
        imageUrl: metaData.imageUrl || '',
        category: '', 
        quantity: 1,
        locationId: selectedLocationRef.current,
        createdAt: new Date().toISOString()
      });

      showToast(`✅ Gespeichert! Ab in den Korb.`, 'success');
      
      // Reset und Kamera neu starten
      setTimeout(() => {
        setUnknownEan(null);
        setFallbackMode('none');
        setPastedUrl('');
        setIsProcessing(false);
        setShowScanner(true);
      }, 1500);

    } catch (error) {
      showToast(`❌ Fehler beim Laden des Links.`, 'error');
      setIsProcessing(false);
    }
  };

  // 🔥 FOTO FALLBACK (Für Rasenmäher oder wenn der Shop keinen Link hat)
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
      
      setTimeout(() => {
        setUnknownEan(null);
        setFallbackMode('none');
        setIsProcessing(false);
        setShowScanner(true);
      }, 1500);

    } catch (error) {
      showToast("❌ Fehler beim Hochladen.", "error");
      setIsProcessing(false);
      setShowScanner(true);
    }
  };

  if (!workspaceId) return <div className="min-h-screen bg-slate-900 p-8 text-center text-white">Lade Scanner...</div>;

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col relative overflow-hidden">
      
      {/* HEADER */}
      <div className="p-4 bg-slate-800 border-b border-slate-700 flex justify-between items-center z-20">
        <div className="flex-1">
          <label className="text-[10px] uppercase text-slate-400 font-bold block mb-1">Vorab-Zuweisung (Optional)</label>
          <select 
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
            className="w-full bg-slate-700 text-white text-sm p-2 rounded-lg border border-slate-600 outline-none font-mono"
          >
            <option value="">Lagerort: Nicht zugewiesen</option>
            {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.displayName}</option>)}
          </select>
        </div>
        <Link href="/" className="ml-4 w-10 h-10 bg-slate-700 rounded-full flex items-center justify-center text-xl hover:bg-slate-600 transition">✖️</Link>
      </div>

      {/* TOAST MELDUNGEN */}
      {toastMessage && (
        <div className={`absolute top-24 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full shadow-2xl font-bold text-sm z-50 whitespace-nowrap border ${
          toastMessage.type === 'success' ? 'bg-green-500/90 border-green-400 text-white' : 
          toastMessage.type === 'error' ? 'bg-red-500/90 border-red-400 text-white' : 
          'bg-slate-800 border-slate-600 text-white animate-pulse'
        }`}>
          {toastMessage.text}
        </div>
      )}

      {/* MAIN BEREICH */}
      <div className="flex-1 relative flex flex-col items-center justify-center bg-black p-4">
        
        {/* NORMALER SCANNER */}
        {showScanner && (
          <div className="w-full max-w-md overflow-hidden rounded-3xl relative z-10">
             <div id="reader" className="w-full bg-black"></div>
          </div>
        )}

        {/* 🔥 DAS NEUE RETTUNGS-MENÜ */}
        {fallbackMode === 'menu' && unknownEan && (
          <div className="w-full max-w-md bg-slate-800 p-6 rounded-3xl border border-slate-700 shadow-2xl animate-fade-in z-20">
            <h2 className="text-xl font-bold mb-2">Item nicht erkannt 🤷‍♂️</h2>
            <p className="text-sm text-slate-400 mb-6">Wir haben <span className="font-mono text-orange-400">{unknownEan}</span> nicht in unseren Datenbanken gefunden.</p>
            
            <div className="space-y-3">
              {/* Shop Suche Buttons (Öffnen in neuem Tab) */}
              <a href={`https://www.galaxus.ch/search?q=${unknownEan}`} target="_blank" rel="noopener noreferrer" className="block w-full text-center bg-blue-900/30 text-blue-400 border border-blue-800/50 py-3 rounded-xl font-bold hover:bg-blue-900/50 transition">
                🔍 Auf Galaxus suchen
              </a>
              <a href={`https://www.hornbach.ch/s/${unknownEan}`} target="_blank" rel="noopener noreferrer" className="block w-full text-center bg-orange-900/30 text-orange-400 border border-orange-800/50 py-3 rounded-xl font-bold hover:bg-orange-900/50 transition">
                🔍 Auf Hornbach suchen
              </a>
            </div>

            <div className="my-6 border-t border-slate-700 relative">
              <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-800 px-3 text-xs text-slate-500 font-bold uppercase">Dann Link hier einfügen</span>
            </div>

            {/* URL Input */}
            <div className="flex gap-2">
              <input 
                type="url" 
                placeholder="https://www.galaxus.ch/..."
                value={pastedUrl}
                onChange={(e) => setPastedUrl(e.target.value)}
                className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 text-sm outline-none focus:border-orange-500"
              />
              <button 
                onClick={handleUrlSubmit}
                disabled={!pastedUrl || isProcessing}
                className="bg-orange-600 text-white px-4 py-3 rounded-xl font-bold disabled:opacity-50"
              >
                Laden
              </button>
            </div>

            <button 
              onClick={() => { setFallbackMode('photo'); setTimeout(() => fileInputRef.current?.click(), 100); }}
              className="mt-6 w-full text-sm text-slate-400 underline text-center"
            >
              Nichts gefunden? Doch ein Foto machen.
            </button>
            
            <button 
              onClick={() => { setFallbackMode('none'); setShowScanner(true); setUnknownEan(null); }}
              className="mt-2 w-full text-xs text-slate-500 text-center uppercase font-bold"
            >
              Abbrechen
            </button>
          </div>
        )}
      </div>

      {/* BOTTOM CONTROLS (Foto knipsen ohne Scan) */}
      <div className="p-8 bg-slate-800 flex flex-col items-center pb-12 z-20">
        <input type="file" accept="image/*" capture="environment" ref={fileInputRef} onChange={handlePhotoCapture} className="hidden" />
        
        {showScanner && (
          <>
            <button onClick={() => fileInputRef.current?.click()} className="w-20 h-20 rounded-full border-4 flex items-center justify-center text-3xl shadow-2xl transition-transform active:scale-90 bg-slate-700 border-slate-500 hover:bg-slate-600">
              📷
            </button>
            <p className="text-xs text-slate-400 font-bold mt-4 uppercase tracking-wider">Foto knipsen (Ohne Barcode)</p>
          </>
        )}
      </div>
    </div>
  );
}