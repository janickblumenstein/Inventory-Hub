"use client";

import { useState, useEffect } from 'react';
import { db, storage } from '../../lib/firebase';
import { collection, addDoc, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import TagSelector from '../../components/TagSelector'; 

export default function NewItem() {
  const router = useRouter();
  
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [locationId, setLocationId] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  
  // NEU: Koordinaten für den roten Punkt
  const [tagX, setTagX] = useState<number | null>(null);
  const [tagY, setTagY] = useState<number | null>(null);

  const [showWarranty, setShowWarranty] = useState(false);
  const [price, setPrice] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  const [locations, setLocations] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      const locSnapshot = await getDocs(collection(db, 'locations'));
      const locs: any[] = [];
      locSnapshot.forEach((doc) => { locs.push({ id: doc.id, ...doc.data() }); });
      setLocations(locs);
    };
    fetchData();
  }, []);

  // Setzt den Marker beim Klick auf das Bild
  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setTagX(x);
    setTagY(y);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      let receiptUrl = "";
      if (showWarranty && receiptFile) {
        const fileRef = ref(storage, `receipts/${Date.now()}_${receiptFile.name}`);
        await uploadBytes(fileRef, receiptFile);
        receiptUrl = await getDownloadURL(fileRef);
      }

      await addDoc(collection(db, 'items'), {
        name,
        tags,
        quantity,
        locationId,
        tagX, // Speichert die X-Koordinate
        tagY, // Speichert die Y-Koordinate
        price: showWarranty ? (Number(price) || 0) : null,
        purchaseDate: showWarranty ? purchaseDate : null,
        receiptUrl: showWarranty ? receiptUrl : null,
        createdAt: new Date().toISOString()
      });
      router.push('/');
    } catch (error) {
      alert("Fehler beim Speichern.");
    } finally {
      setIsSaving(false);
    }
  };

  const selectedLoc = locations.find(l => l.id === locationId);

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-xl mx-auto bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        
        {/* NEU: Header mit Icon-Button zum Abbrechen */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-slate-800">Neues Werkzeug</h1>
          <Link href="/" className="w-10 h-10 flex items-center justify-center bg-slate-100 text-slate-500 rounded-full hover:bg-slate-200 transition text-lg">
            ✖️
          </Link>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full p-3 border border-slate-300 rounded-xl bg-white text-slate-900 outline-none font-bold text-lg" placeholder="Bezeichnung (z.B. Makita Flex)" required />
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Tags / Kategorien</label>
              <TagSelector selectedTags={tags} onTagsChange={setTags} />
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Menge</label>
                <input type="number" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className="w-full p-3 border border-slate-300 rounded-xl bg-white text-slate-900" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Lagerort</label>
                <select value={locationId} onChange={(e) => { setLocationId(e.target.value); setTagX(null); setTagY(null); }} className="w-full p-3 border border-slate-300 rounded-xl bg-white text-slate-900" required>
  <option value="">-- Ort wählen --</option>
  {(() => {
    const buildTree = (parentId: string | null, depth: number): any[] => {
      let result: any[] = [];
      const children = locations.filter(l => (l.parentId || null) === parentId);
      children.forEach(child => {
        result.push({ ...child, depth });
        result = result.concat(buildTree(child.id, depth + 1));
      });
      return result;
    };
    return buildTree(null, 0).map(loc => (
      <option key={loc.id} value={loc.id}>
        {'\u00A0\u00A0\u00A0'.repeat(loc.depth)}{loc.depth > 0 ? '↳ ' : ''}{loc.name}
      </option>
    ));
  })()}
</select>
              </div>
            </div>

            {/* NEU: Bild des Lagerorts mit Klick-Marker */}
            {selectedLoc && selectedLoc.imageUrl && (
              <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-xl animate-fade-in">
                <p className="text-xs text-slate-500 mb-2 uppercase font-bold tracking-wider">Wo genau liegt es? (Klicke auf das Bild)</p>
                <div className="relative inline-block border-2 border-slate-300 rounded-lg overflow-hidden shadow-sm w-full">
                  <img 
                    src={selectedLoc.imageUrl} 
                    alt="Lagerort" 
                    className="w-full h-auto cursor-crosshair" 
                    onClick={handleImageClick}
                  />
                  {tagX !== null && tagY !== null && (
                    <div 
                      className="absolute w-6 h-6 bg-red-600 border-2 border-white rounded-full shadow-lg transform -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-all"
                      style={{ left: `${tagX}%`, top: `${tagY}%` }}
                    />
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 px-1 border-t pt-4">
            <input type="checkbox" id="toggleWarranty" checked={showWarranty} onChange={(e) => setShowWarranty(e.target.checked)} className="w-5 h-5 rounded border-slate-300 text-orange-600 focus:ring-orange-500" />
            <label htmlFor="toggleWarranty" className="text-sm font-semibold text-slate-700 cursor-pointer">🧾 Garantie & Beleg erfassen</label>
          </div>

          {showWarranty && (
            <div className="bg-orange-50 p-4 rounded-xl border border-orange-200 space-y-4 animate-fade-in">
              <div className="grid grid-cols-2 gap-4">
                <input type="number" step="0.05" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Preis" className="w-full p-2 border border-slate-300 rounded-lg bg-white text-slate-900" />
                <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg bg-white text-slate-900" />
              </div>
              <input type="file" accept="image/*" capture="environment" onChange={(e) => e.target.files && setReceiptFile(e.target.files[0])} className="text-xs text-slate-500" />
            </div>
          )}

          <button type="submit" disabled={isSaving} className="w-full bg-orange-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-orange-200 disabled:opacity-50 mt-8">
            {isSaving ? 'Wird gespeichert...' : 'Item speichern'}
          </button>
        </form>
      </div>
    </div>
  );
}