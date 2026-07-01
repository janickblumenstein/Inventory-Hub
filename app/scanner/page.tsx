"use client";

import { useEffect, useState, useRef } from 'react';
import { db, storage } from '../../lib/firebase';
import { collection, query, where, getDocs, addDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useWorkspace } from '../../context/WorkspaceContext';

// 🛒 DAS MASTER-LEXIKON: Alle unterstützten Shops
const SUPPORTED_SHOPS: Record<string, { name: string, urlPattern: string, style: string }> = {
  galaxus: { name: 'Galaxus', urlPattern: 'https://www.galaxus.ch/search?q=', style: 'bg-blue-900/30 text-blue-400 border-blue-800/50' },
  hornbach: { name: 'Hornbach', urlPattern: 'https://www.hornbach.ch/s/', style: 'bg-orange-900/30 text-orange-400 border-orange-800/50' },
  migros: { name: 'Migros', urlPattern: 'https://www.migros.ch/de/search?query=', style: 'bg-orange-600/20 text-orange-500 border-orange-500/30' },
  coop: { name: 'Coop', urlPattern: 'https://www.coop.ch/de/search/?text=', style: 'bg-red-900/30 text-red-400 border-red-800/50' },
  brack: { name: 'Brack.ch', urlPattern: 'https://www.brack.ch/search?query=', style: 'bg-yellow-900/30 text-yellow-400 border-yellow-800/50' },
  obi: { name: 'Obi', urlPattern: 'https://www.obi.ch/search/', style: 'bg-orange-900/30 text-orange-400 border-orange-800/50' }
};

export default function SuperScanner() {
  const router = useRouter();
  const { workspaceId } = useWorkspace();
  
  // EINSTELLUNGEN
  const [userPreferredShops, setUserPreferredShops] = useState<string[]>([]);
  const [customShops, setCustomShops] = useState<{id: string, name: string, urlPattern: string}[]>([]);

  // LAGERORTE
  const [locations, setLocations] = useState<any[]>([]);
  const [selectedLocation, setSelectedLocation] = useState('');
  const selectedLocationRef = useRef(selectedLocation);
  useEffect(() => { selectedLocationRef.current = selectedLocation; }, [selectedLocation]);

  // UI STATES
  const [isProcessing, setIsProcessing] = useState(false);
  const isProcessingRef = useRef(isProcessing);
  useEffect(() => { isProcessingRef.current = isProcessing; }, [isProcessing]);

  const [toastMessage, setToastMessage] = useState<{text: string, type: 'success' | 'info' | 'error'} | null>(null);
  
  // SCANNER & MENÜ STATES
  const [showScanner, setShowScanner] = useState(true); 
  const [fallbackMode, setFallbackMode] = useState<'none' | 'menu' | 'success'>('none');
  const [unknownEan, setUnknownEan] = useState<string | null>(null);
  const [foundItem, setFoundItem] = useState<{title: string, imageUrl: string, source: string} | null>(null);
  const [pastedUrl, setPastedUrl] = useState('');
  
  // EINKAUFSLISTE
  const [onShoppingList, setOnShoppingList] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper für Einrückung
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
    const fetchSettings = async () => {
      const docRef = import('firebase/firestore').then(({ doc, getDoc }) => {
        return getDoc(doc(db, 'workspaces', workspaceId, 'settings', 'main')).then(docSnap => {
          if (docSnap.exists()) {
            setUserPreferredShops(docSnap.data().preferredShops || ['galaxus', 'hornbach', 'migros', 'coop']);
            setCustomShops(docSnap.data().customShops || []);
          } else {
            setUserPreferredShops(['galaxus', 'hornbach', 'migros', 'coop']);
          }
        });
      });
    };
    fetchSettings();
  }, [workspaceId]);

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

  const resetScanner = () => {
    setFallbackMode('none');
    setUnknownEan(null);
    setFoundItem(null);
    setPastedUrl('');
    setOnShoppingList(false);
    setIsProcessing(false);
    setShowScanner(true);
  };

  // 🔥 KAMERA INITIALISIERUNG (Vercel-sicher)
  useEffect(() => {
    if (!workspaceId || !showScanner) return; 

    let scannerInstance: any = null;

    const initializeScanner = async () => {
      const { Html5QrcodeScanner } = await import('html5-qrcode');

      scannerInstance = new Html5QrcodeScanner("reader", { fps: 10, qrbox: { width: 250, height: 250 }, rememberLastUsedCamera: true }, false);

      scannerInstance.render(
        async (decodedText: string) => {
          if (isProcessingRef.current) return; 
          
          setIsProcessing(true);
          showToast("Prüfe Datenbank...", "info", 10000);

          try {
            // 0. ITEM-QR GESCANNT? (Link auf /item/<id> aus unserem Etikett)
            const itemLinkMatch = decodedText.match(/\/item\/([^/?#]+)/);
            if (itemLinkMatch) {
              scannerInstance.clear();
              router.push(`/item/${itemLinkMatch[1]}`);
              return;
            }

            // 0b. LAGERORT-QR GESCANNT? (Link auf /locations/<id> aus unserem Etikett)
            const locLinkMatch = decodedText.match(/\/locations\/([^/?#]+)/);
            if (locLinkMatch) {
              scannerInstance.clear();
              router.push(`/locations/${locLinkMatch[1]}`);
              return;
            }

            // 1. LAGERORT-CODE GESCANNT? (ältere Etiketten mit reinem Code)
            const locQuery = query(collection(db, 'workspaces', workspaceId, 'locations'), where('code', '==', decodedText));
            const locSnap = await getDocs(locQuery);
            if (!locSnap.empty) {
              scannerInstance.clear();
              router.push(`/locations/${locSnap.docs[0].id}`);
              return;
            }

            // 2. ITEM BEREITS IN DEINER WERKSTATT?
            const itemQ = query(collection(db, 'workspaces', workspaceId, 'items'), where('ean', '==', decodedText));
            const querySnapshot = await getDocs(itemQ);
            if (!querySnapshot.empty) {
              scannerInstance.clear();
              router.push(`/item/${querySnapshot.docs[0].id}/edit`); 
              return;
            }

            // 3. IM NETZ SUCHEN
            showToast("Suche in globalen Datenbanken...", "info", 10000);
            const res = await fetch('/api/search-ean', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ean: decodedText.trim() })
            });
            const data = await res.json();

            if (res.ok && data.title) {
              setUnknownEan(decodedText);
              setFoundItem(data);
              setFallbackMode('success');
              setShowScanner(false);
              setToastMessage(null);
              setIsProcessing(false);
            } else {
              setUnknownEan(decodedText);
              setFallbackMode('menu');
              setShowScanner(false);
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
        (error: any) => {} 
      );
    };

    initializeScanner();

    return () => { 
      if (scannerInstance) {
        scannerInstance.clear().catch((e: any) => console.error(e)); 
      }
    };
  }, [workspaceId, router, showScanner]);

  const handleUrlSubmit = async () => {
    if (!pastedUrl || !workspaceId) return;
    setIsProcessing(true);
    showToast("🔍 Lade Daten vom Shop...", "info", 10000);

    try {
      const metaRes = await fetch('/api/fetch-meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: pastedUrl })
      });
      const metaData = await metaRes.json();

      await addDoc(collection(db, 'workspaces', workspaceId, 'items'), {
        name: foundItem ? foundItem.title : (metaData.title || `Neues Item (${unknownEan})`),
        ean: unknownEan || '',
        productUrl: pastedUrl,
        imageUrl: foundItem ? foundItem.imageUrl : (metaData.imageUrl || ''),
        category: '', 
        quantity: 1,
        locationId: selectedLocationRef.current,
        onShoppingList: onShoppingList,
        createdAt: new Date().toISOString()
      });

      showToast(`✅ Gespeichert! Ab in den Korb.`, 'success');
      setTimeout(resetScanner, 1500);
    } catch (error) {
      showToast(`❌ Fehler beim Laden des Links.`, 'error');
      setIsProcessing(false);
    }
  };

  const saveDirectly = async () => {
    if (!foundItem || !workspaceId) return;
    setIsProcessing(true);

    try {
      await addDoc(collection(db, 'workspaces', workspaceId, 'items'), {
        name: foundItem.title,
        ean: unknownEan || '',
        productUrl: '',
        imageUrl: foundItem.imageUrl,
        category: '', 
        quantity: 1,
        locationId: selectedLocationRef.current,
        onShoppingList: onShoppingList,
        createdAt: new Date().toISOString()
      });

      showToast(`✅ Gespeichert! Ab in den Korb.`, 'success');
      setTimeout(resetScanner, 1500);
    } catch (error) {
      showToast(`❌ Fehler beim Speichern.`, 'error');
      setIsProcessing(false);
    }
  };

  const triggerPhoto = () => {
    setShowScanner(false);
    setTimeout(() => fileInputRef.current?.click(), 200);
  };

  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) { resetScanner(); return; }
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
        onShoppingList: onShoppingList,
        createdAt: new Date().toISOString()
      });

      showToast(`✅ Foto gespeichert! Ab in den Korb.`, 'success');
      setTimeout(resetScanner, 1500);
    } catch (error) {
      showToast("❌ Fehler beim Hochladen.", "error");
      setTimeout(resetScanner, 1500);
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
            className="w-full bg-slate-700 text-white text-sm p-2 rounded-lg border border-slate-600 outline-none font-mono focus:border-orange-500"
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
          <div className="w-full max-w-md overflow-hidden rounded-3xl relative z-10 border border-slate-700">
             <div id="reader" className="w-full bg-black"></div>
          </div>
        )}

        {/* 🟢 ERFOLGS-MENÜ (EAN ERKANNT) */}
        {fallbackMode === 'success' && foundItem && (
          <div className="w-full max-w-md bg-slate-800 p-6 rounded-3xl border border-green-500/30 shadow-2xl animate-fade-in z-20">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 bg-white rounded-xl overflow-hidden flex-shrink-0 border border-slate-600 p-1">
                {foundItem.imageUrl ? <img src={foundItem.imageUrl} className="w-full h-full object-contain" alt="Produkt" /> : <span className="text-3xl text-center w-full h-full flex items-center justify-center">📦</span>}
              </div>
              <div>
                <h2 className="text-lg font-bold line-clamp-2 leading-tight">{foundItem.title}</h2>
                <p className="text-[10px] text-slate-400 mt-1 uppercase">Gefunden via {foundItem.source}</p>
              </div>
            </div>

            {/* Einkaufslisten-Toggle */}
            <label className="flex items-center gap-3 bg-slate-900 p-3 rounded-xl border border-slate-700 mb-6 cursor-pointer">
              <input type="checkbox" checked={onShoppingList} onChange={(e) => setOnShoppingList(e.target.checked)} className="w-5 h-5 rounded border-slate-500 text-orange-500 focus:ring-orange-500 bg-slate-800" />
              <span className="text-sm font-bold">{onShoppingList ? '❤️ Auf Einkaufsliste' : '🤍 Auf Einkaufsliste setzen'}</span>
            </label>

            <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Shop-Link ergänzen (optional):</p>
            <div className="grid grid-cols-2 gap-2 mb-6">
              {/* 1. Die Standard-Shops */}
              {userPreferredShops.map(shopKey => {
                const shop = SUPPORTED_SHOPS[shopKey];
                if (!shop) return null;
                return (
                  <a key={shopKey} href={`${shop.urlPattern}${encodeURIComponent(foundItem.title)}`} target="_blank" rel="noopener noreferrer" className={`text-xs py-3 rounded-xl text-center font-bold transition ${shop.style}`}>
                     {shop.name}
                  </a>
                );
              })}
              
              {/* 2. DEINE EIGENEN SHOPS (Sucht jetzt auch mit dem Titel!) */}
              {customShops.map(shop => (
                <a key={shop.id} href={`${shop.urlPattern}${encodeURIComponent(foundItem.title)}`} target="_blank" rel="noopener noreferrer" className="text-xs py-3 rounded-xl text-center font-bold transition bg-slate-700/50 text-white border-slate-600 hover:bg-slate-700">
                   {shop.name}
                </a>
              ))}
            </div>

            <div className="flex gap-2 mb-4">
              <input type="url" placeholder="Shop-Link einfügen..." value={pastedUrl} onChange={(e) => setPastedUrl(e.target.value)} className="flex-1 bg-white text-slate-900 placeholder-slate-400 border border-slate-300 rounded-xl px-3 py-2 text-sm outline-none focus:border-orange-500" />
              <button onClick={handleUrlSubmit} disabled={!pastedUrl || isProcessing} className="bg-orange-600 text-white px-4 py-2 rounded-xl font-bold disabled:opacity-50 text-sm">Laden</button>
            </div>
            
            <button onClick={saveDirectly} disabled={isProcessing} className="w-full bg-green-600/20 text-green-400 border border-green-500/50 py-3 rounded-xl font-bold hover:bg-green-600/30 transition shadow-lg">
              Ohne Link speichern
            </button>
            <button onClick={resetScanner} className="mt-4 w-full text-xs text-slate-500 text-center uppercase font-bold">Abbrechen</button>
          </div>
        )}

        {/* 🟠 RETTUNGS-MENÜ (EAN NICHT GEFUNDEN) */}
        {fallbackMode === 'menu' && unknownEan && (
          <div className="w-full max-w-md bg-slate-800 p-6 rounded-3xl border border-slate-700 shadow-2xl animate-fade-in z-20">
            <h2 className="text-xl font-bold mb-2">Item nicht erkannt 🤷‍♂️</h2>
            <p className="text-sm text-slate-400 mb-6">Wir haben <span className="font-mono text-orange-400">{unknownEan}</span> nicht gefunden.</p>
            
            {/* Einkaufslisten-Toggle */}
            <label className="flex items-center gap-3 bg-slate-900 p-3 rounded-xl border border-slate-700 mb-6 cursor-pointer">
              <input type="checkbox" checked={onShoppingList} onChange={(e) => setOnShoppingList(e.target.checked)} className="w-5 h-5 rounded border-slate-500 text-orange-500 focus:ring-orange-500 bg-slate-800" />
              <span className="text-sm font-bold">{onShoppingList ? '❤️ Auf Einkaufsliste' : '🤍 Auf Einkaufsliste setzen'}</span>
            </label>

            <div className="grid grid-cols-2 gap-2 mb-6">
              {/* 1. Die Standard-Shops */}
              {userPreferredShops.map(shopKey => {
                const shop = SUPPORTED_SHOPS[shopKey];
                if (!shop) return null;
                return (
                  <a key={shopKey} href={`${shop.urlPattern}${unknownEan}`} target="_blank" rel="noopener noreferrer" className={`text-xs py-3 rounded-xl text-center font-bold transition ${shop.style}`}>
                    🔍 {shop.name}
                  </a>
                );
              })}
              
              {/* 2. DEINE EIGENEN SHOPS */}
              {customShops.map(shop => (
                <a key={shop.id} href={`${shop.urlPattern}${unknownEan}`} target="_blank" rel="noopener noreferrer" className="text-xs py-3 rounded-xl text-center font-bold transition bg-slate-700/50 text-white border-slate-600 hover:bg-slate-700">
                  🔍 {shop.name}
                </a>
              ))}
            </div>

            <div className="flex gap-2">
              <input type="url" placeholder="Gefundenen Shop-Link einfügen..." value={pastedUrl} onChange={(e) => setPastedUrl(e.target.value)} className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 text-sm outline-none focus:border-orange-500" />
              <button onClick={handleUrlSubmit} disabled={!pastedUrl || isProcessing} className="bg-orange-600 text-white px-4 py-3 rounded-xl font-bold disabled:opacity-50 text-sm">Laden</button>
            </div>

            <button onClick={triggerPhoto} className="mt-6 w-full text-sm text-slate-400 underline text-center">Nichts gefunden? Doch ein Foto machen.</button>
            <button onClick={resetScanner} className="mt-4 w-full text-xs text-slate-500 text-center uppercase font-bold">Abbrechen</button>
          </div>
        )}
      </div>

      {/* BOTTOM CONTROLS (Manuelles Foto knipsen ohne Scan) */}
      <div className="p-8 bg-slate-800 flex flex-col items-center pb-12 z-20">
        <input type="file" accept="image/*" capture="environment" ref={fileInputRef} onChange={handlePhotoCapture} className="hidden" />
        
        {showScanner && (
          <>
            <button onClick={triggerPhoto} className="w-20 h-20 rounded-full border-4 flex items-center justify-center text-3xl shadow-2xl transition-transform active:scale-90 bg-slate-700 border-slate-500 hover:bg-slate-600">📷</button>
            <p className="text-xs text-slate-400 font-bold mt-4 uppercase tracking-wider">Ohne Barcode knipsen</p>
          </>
        )}
      </div>
    </div>
  );
}