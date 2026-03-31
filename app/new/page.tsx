"use client";

import { useState, useEffect, Suspense } from 'react';
import { db } from '../../lib/firebase'; 
import { collection, addDoc, getDocs, serverTimestamp } from 'firebase/firestore';
import { useRouter, useSearchParams } from 'next/navigation';

function NewItemForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefilledEan = searchParams.get('ean') || ''; 
  
  const [name, setName] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [locationId, setLocationId] = useState(''); 
  const [locations, setLocations] = useState<any[]>([]); 
  const [ean, setEan] = useState(prefilledEan); 
  const [isSaving, setIsSaving] = useState(false);
  const [isFetchingApi, setIsFetchingApi] = useState(false);

  const [selectedLocationImage, setSelectedLocationImage] = useState<string | null>(null);
  const [tagCoords, setTagCoords] = useState<{x: number, y: number} | null>(null);

  useEffect(() => {
    const fetchLocations = async () => {
      const querySnapshot = await getDocs(collection(db, 'locations'));
      const locs: any[] = [];
      querySnapshot.forEach((doc) => { locs.push({ id: doc.id, ...doc.data() }); });
      setLocations(locs);
    };
    fetchLocations();
  }, []);

  // HIER IST DAS NEUE API-WASSERFALL-SYSTEM (OpenFoodFacts + UPCitemdb)
  useEffect(() => {
    if (ean) {
      const fetchEanData = async (searchCode: string) => {
        setIsFetchingApi(true);
        try {
          // VERSUCH 1: OpenFoodFacts (Der König für europäische Supermarkt-Artikel & Cola!)
          const offResponse = await fetch(`https://world.openfoodfacts.org/api/v0/product/${searchCode}.json`);
          const offData = await offResponse.json();

          if (offData && offData.status === 1 && offData.product && offData.product.product_name) {
            const foundTitle = offData.product.product_name;
            setName(foundTitle);
            generateSmartTagsFor(foundTitle);
            return true; // Treffer im ersten Versuch!
          }

          // VERSUCH 2: UPCitemdb (Unser Backup für Werkzeuge und US-Artikel)
          const upcResponse = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${searchCode}`);
          const upcData = await upcResponse.json();

          if (upcData && upcData.items && upcData.items.length > 0) {
            const foundTitle = upcData.items[0].title;
            setName(foundTitle);
            generateSmartTagsFor(foundTitle);
            return true; // Treffer im zweiten Versuch!
          }

          return false; // In beiden Datenbanken nicht gefunden
        } catch (error) {
          console.error("API Fehler:", error);
          return false;
        } finally {
          setIsFetchingApi(false);
        }
      };
      
      const runSearch = async () => {
        // 1. Suche genau wie gescannt
        let success = await fetchEanData(ean);
        
        // 2. Fallback für EAN-13 -> UPC (Wenn es 13 Stellen sind und mit 0 beginnt)
        if (!success && ean.length === 13 && ean.startsWith('0')) {
          await fetchEanData(ean.substring(1));
        }
      };

      runSearch();
    }
  }, [ean]);

  const generateSmartTagsFor = (itemName: string) => {
    const lowerName = itemName.toLowerCase();
    let newTags = [];
    if (lowerName.includes('bohr') || lowerName.includes('flex') || lowerName.includes('schleifer')) newTags.push('Werkzeug', 'Maschine');
    if (lowerName.includes('schraube') || lowerName.includes('nagel') || lowerName.includes('dübel')) newTags.push('Verbrauchsmaterial');
    if (lowerName.includes('holz')) newTags.push('Holzbearbeitung');
    if (lowerName.includes('metall')) newTags.push('Metallbearbeitung');
    if (newTags.length === 0) newTags.push('Allgemein');
    setTags(newTags);
  };

  const handleManualTagClick = () => generateSmartTagsFor(name);

  const getLocationDisplayName = (loc: any) => {
    if (!loc.parentId) return loc.name; 
    const parent = locations.find(l => l.id === loc.parentId);
    return parent ? `${loc.name} (in ${parent.name})` : loc.name;
  };

  const handleLocationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLocId = e.target.value;
    setLocationId(newLocId);
    setTagCoords(null); 
    const selectedLoc = locations.find(loc => loc.id === newLocId);
    if (selectedLoc && selectedLoc.imageUrl) {
      setSelectedLocationImage(selectedLoc.imageUrl);
    } else {
      setSelectedLocationImage(null);
    }
  };

  const handleImageClick = (e: any) => {
    const rect = e.target.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setTagCoords({ x, y });
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!locationId) { alert("Bitte wähle einen Lagerort aus!"); return; }
    setIsSaving(true);

    try {
      await addDoc(collection(db, 'items'), {
        name,
        tags,
        quantity,
        ean,
        status: 'AVAILABLE',
        locationId: locationId, 
        tagX: tagCoords ? tagCoords.x : null,
        tagY: tagCoords ? tagCoords.y : null,
        createdAt: serverTimestamp()
      });
      router.push('/'); 
    } catch (error) {
      console.error("Fehler: ", error);
      alert('Fehler beim Speichern. Siehe Console.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      
      {ean && (
        <div className="bg-slate-800 text-white p-3 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📸</span>
            <div>
              <p className="text-xs text-slate-400">Gescannter Barcode</p>
              <p className="font-mono font-medium">{ean}</p>
            </div>
          </div>
          {isFetchingApi && (
            <span className="text-xs bg-slate-700 px-2 py-1 rounded-full animate-pulse text-orange-300">
              Suche in Online-Datenbank... 🌍
            </span>
          )}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Was möchtest du erfassen?</label>
        <div className="flex gap-2">
          <input 
            type="text" 
            value={name} 
            onChange={(e) => setName(e.target.value)} 
            className={`w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none transition-colors ${isFetchingApi ? 'bg-slate-100 text-slate-400' : 'bg-white'}`} 
            required 
            placeholder="z.B. Makita Winkelschleifer" 
            disabled={isFetchingApi}
          />
          <button type="button" onClick={handleManualTagClick} className="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm whitespace-nowrap">✨ Tags</button>
        </div>
      </div>

      {tags.length > 0 && (
        <div className="bg-orange-50 p-4 rounded-lg border border-orange-100">
          <div className="flex flex-wrap gap-2">
            {tags.map((tag, index) => (
              <span key={index} className="bg-white border border-orange-200 text-orange-700 text-xs px-2 py-1 rounded-full">{tag}</span>
            ))}
          </div>
        </div>
      )}

      <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Menge / Bestand</label>
          <input type="number" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className="w-32 p-2 border border-slate-300 rounded-lg outline-none" min="1" />
      </div>

      <div className="border-t pt-4">
        <label className="block text-sm font-medium text-slate-700 mb-2">Wo wird das aufbewahrt?</label>
        {locations.length === 0 ? (
          <p className="text-sm text-red-500 bg-red-50 p-3 rounded-md border border-red-100">
            Du hast noch keine Lagerorte angelegt!
          </p>
        ) : (
          <select value={locationId} onChange={handleLocationChange} className="w-full p-3 border border-slate-300 rounded-lg outline-none bg-white focus:ring-2 focus:ring-orange-500" required>
            <option value="">-- Bitte Lagerort wählen --</option>
            {locations.map(loc => (
              <option key={loc.id} value={loc.id}>{getLocationDisplayName(loc)}</option>
            ))}
          </select>
        )}
      </div>

      {selectedLocationImage && (
        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mt-4 animate-fade-in">
          <p className="text-sm text-slate-600 mb-2">
            <span className="font-semibold text-orange-600">Optional:</span> Klicke auf das Bild, um die genaue Position zu markieren.
          </p>
          <div className="relative inline-block border-2 border-white shadow-md rounded-lg overflow-hidden">
            <img src={selectedLocationImage} alt="Lagerort Vorschau" onClick={handleImageClick} className="max-w-full h-auto cursor-crosshair hover:opacity-90 transition-opacity" />
            {tagCoords && (
              <div className="absolute w-6 h-6 bg-red-600 border-2 border-white rounded-full shadow-lg pointer-events-none" style={{ left: `${tagCoords.x}%`, top: `${tagCoords.y}%`, transform: 'translate(-50%, -50%)' }} />
            )}
          </div>
        </div>
      )}

      <button type="submit" disabled={isSaving || locations.length === 0 || isFetchingApi} className="w-full bg-orange-600 text-white font-bold py-3 rounded-lg hover:bg-orange-700 disabled:opacity-50 mt-8">
        {isSaving ? 'Speichert...' : 'Item in Datenbank speichern'}
      </button>
    </form>
  );
}

export default function NewItem() {
  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-xl mx-auto bg-white p-6 rounded-xl shadow-sm border border-slate-100">
        <h1 className="text-2xl font-bold mb-6 text-slate-800">Neues Item erfassen</h1>
        <Suspense fallback={<div className="text-center text-slate-500 p-8">Lade Formular...</div>}>
          <NewItemForm />
        </Suspense>
      </div>
    </div>
  );
}