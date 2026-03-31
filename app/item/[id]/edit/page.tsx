"use client";

import { useState, useEffect, use } from 'react';
import { db, storage } from '../../../../lib/firebase'; 
import { doc, getDoc, updateDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import TagSelector from '../../../../components/TagSelector';

export default function EditItem({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  
  // React 19 / Next.js 15 konformes Entpacken der Params
  const resolvedParams = use(params);
  const id = resolvedParams.id;
  
  const [name, setName] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [locationId, setLocationId] = useState(''); 
  
  // Koordinaten für den roten Punkt
  const [tagX, setTagX] = useState<number | null>(null);
  const [tagY, setTagY] = useState<number | null>(null);
  
  const [attributes, setAttributes] = useState<Record<string, string>>({});
  const [learnedAttributes, setLearnedAttributes] = useState<Record<string, string[]>>({});

  const [showWarranty, setShowWarranty] = useState(false);
  const [price, setPrice] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [receiptUrl, setReceiptUrl] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  const [locations, setLocations] = useState<any[]>([]); 
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // 1. Lagerorte laden
        const locSnapshot = await getDocs(collection(db, 'locations'));
        const locs: any[] = [];
        locSnapshot.forEach((doc) => { locs.push({ id: doc.id, ...doc.data() }); });
        setLocations(locs);

        // 2. Attribute für Autocomplete lernen
        const itemSnapshot = await getDocs(collection(db, 'items'));
        const learned: Record<string, Set<string>> = {};
        itemSnapshot.forEach((doc) => {
          const d = doc.data();
          if (d.attributes) {
            Object.entries(d.attributes).forEach(([k, v]) => {
              if (!learned[k]) learned[k] = new Set();
              if (v) learned[k].add(String(v));
            });
          }
        });
        const learnedFinal: Record<string, string[]> = {};
        Object.keys(learned).forEach(k => { learnedFinal[k] = Array.from(learned[k]); });
        setLearnedAttributes(learnedFinal);

        // 3. Dieses Item laden und Formular befüllen
        if (id) {
          const itemRef = doc(db, 'items', id);
          const itemSnap = await getDoc(itemRef);
          if (itemSnap.exists()) {
            const data = itemSnap.data();
            setName(data.name || '');
            setTags(data.tags || []);
            setQuantity(data.quantity || 1);
            setLocationId(data.locationId || '');
            setTagX(data.tagX ?? null);
            setTagY(data.tagY ?? null);
            setAttributes(data.attributes || {});
            
            setPrice(data.price || '');
            setPurchaseDate(data.purchaseDate || '');
            setReceiptUrl(data.receiptUrl || '');
            
            if (data.price || data.purchaseDate || data.receiptUrl) {
              setShowWarranty(true);
            }
          }
        }
      } catch (error) {
        console.error("Fehler beim Laden:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [id]);

  // Marker setzen
  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setTagX(x);
    setTagY(y);
  };

  const updateAttribute = (key: string, value: string) => {
    setAttributes(prev => ({ ...prev, [key]: value }));
  };

  const renderAttributeInput = (label: string, key: string, placeholder: string, defaultOptions: string[] = []) => {
    const learned = learnedAttributes[key] || [];
    const combinedOptions = Array.from(new Set([...defaultOptions, ...learned])).sort();
    const listId = `datalist-edit-${key}`;
    return (
      <div className="col-span-1">
        <label className="text-xs text-slate-500 block mb-1">{label}</label>
        <input type="text" list={listId} placeholder={placeholder} value={attributes[key] || ''} onChange={e => updateAttribute(key, e.target.value)} className="w-full p-2 border border-slate-300 rounded-md bg-white text-slate-900 text-sm outline-none" />
        <datalist id={listId}>{combinedOptions.map(opt => <option key={opt} value={opt} />)}</datalist>
      </div>
    );
  };

  // ACHTUNG: Hier nutzen wir updateDoc statt addDoc!
  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      let finalReceiptUrl = receiptUrl;
      if (showWarranty && receiptFile) {
        const fileRef = ref(storage, `receipts/${id}_${Date.now()}`);
        await uploadBytes(fileRef, receiptFile);
        finalReceiptUrl = await getDownloadURL(fileRef);
      }

      const itemRef = doc(db, 'items', id);
      await updateDoc(itemRef, {
        name,
        tags, 
        quantity,
        locationId,
        tagX,
        tagY,
        attributes,
        price: showWarranty ? (Number(price) || 0) : null,
        purchaseDate: showWarranty ? purchaseDate : null,
        receiptUrl: showWarranty ? finalReceiptUrl : null
      });
      router.push(`/item/${id}`); 
    } catch (error) {
      alert('Fehler beim Speichern.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (window.confirm("Möchtest du dieses Item wirklich dauerhaft löschen?")) {
      await deleteDoc(doc(db, 'items', id));
      router.push('/');
    }
  };

  const hasScrewTag = tags.some(t => t.toLowerCase().includes('schraube') || t.toLowerCase().includes('befestigung'));
  const hasMachineTag = tags.some(t => t.toLowerCase().includes('maschine') || t.toLowerCase().includes('säge') || t.toLowerCase().includes('schleifer') || t.toLowerCase().includes('akkuschrauber'));
  const selectedLoc = locations.find(l => l.id === locationId);

  if (isLoading) return <div className="min-h-screen bg-slate-50 p-8 text-center text-slate-500">Lade Daten...</div>;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-xl mx-auto bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        
        {/* Header mit Icon-Buttons */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-slate-800">Item bearbeiten</h1>
          <div className="flex gap-3">
            <button type="button" onClick={handleDelete} className="w-10 h-10 flex items-center justify-center bg-red-50 text-red-500 rounded-full hover:bg-red-100 transition text-lg" title="Löschen">🗑️</button>
            <Link href={`/item/${id}`} className="w-10 h-10 flex items-center justify-center bg-slate-100 text-slate-500 rounded-full hover:bg-slate-200 transition text-lg" title="Abbrechen">✖️</Link>
          </div>
        </div>
        
        <form onSubmit={handleSave} className="space-y-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Bezeichnung</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full p-3 border border-slate-300 rounded-xl bg-white text-slate-900 outline-none font-bold text-lg" required />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Tags / Kategorien</label>
              <TagSelector selectedTags={tags} onTagsChange={setTags} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Menge</label>
                <input type="number" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className="w-full p-3 border border-slate-300 rounded-xl bg-white text-slate-900" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Lagerort</label>
                <select 
                  value={locationId} 
                  onChange={(e) => { setLocationId(e.target.value); setTagX(null); setTagY(null); }} 
                  className="w-full p-3 border border-slate-300 rounded-xl bg-white text-slate-900"
                >
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

            {/* Bild des Lagerorts mit Klick-Marker */}
            {selectedLoc && selectedLoc.imageUrl && (
              <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-xl animate-fade-in">
                <p className="text-xs text-slate-500 mb-2 uppercase font-bold tracking-wider">Position im Regal (Klicken zum Ändern)</p>
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

          {/* SMARTE ATTRIBUTE */}
          {(hasScrewTag || hasMachineTag) && (
            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 animate-fade-in">
              <label className="block text-sm font-medium text-slate-700 mb-4">Spezifische Attribute</label>
              
              {hasScrewTag && (
                <div className="grid grid-cols-2 gap-3 mb-3">
                  {renderAttributeInput('Länge (mm)', 'Länge (mm)', '40')}
                  {renderAttributeInput('Durchmesser', 'Durchmesser', '4')}
                </div>
              )}
              {hasMachineTag && (
                <div className="grid grid-cols-2 gap-3">
                  {renderAttributeInput('Leistung', 'Leistung', '18V')}
                  {renderAttributeInput('Energiequelle', 'Energiequelle', 'Akku', ['Akku', 'Netz'])}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 px-1 border-t pt-4">
            <input type="checkbox" id="toggleEditWarranty" checked={showWarranty} onChange={(e) => setShowWarranty(e.target.checked)} className="w-5 h-5 rounded border-slate-300 text-orange-600 focus:ring-orange-500" />
            <label htmlFor="toggleEditWarranty" className="text-sm font-semibold text-slate-700 cursor-pointer">🧾 Garantie & Beleg verwalten</label>
          </div>

          {showWarranty && (
            <div className="bg-orange-50 p-4 rounded-xl border border-orange-200 space-y-4 animate-fade-in">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] text-slate-500 uppercase">Preis</label>
                  <input type="number" step="0.05" value={price} onChange={(e) => setPrice(e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg bg-white text-slate-900" />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase">Kaufdatum</label>
                  <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg bg-white text-slate-900" />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase block mb-1">Neuer Kassenbeleg</label>
                <input type="file" accept="image/*" capture="environment" onChange={(e) => e.target.files && setReceiptFile(e.target.files[0])} className="text-xs text-slate-500" />
                {receiptUrl && <p className="text-[10px] text-green-600 mt-1">✓ Beleg bereits gespeichert</p>}
              </div>
            </div>
          )}

          <div className="pt-6">
            <button type="submit" disabled={isSaving} className="w-full bg-orange-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-orange-200 disabled:opacity-50 transition">
              {isSaving ? 'Speichert...' : 'Änderungen speichern'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}