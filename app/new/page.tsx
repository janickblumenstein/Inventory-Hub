"use client";

import { useState, useEffect } from 'react';
import { db, storage } from '../../lib/firebase';
import { collection, addDoc, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import TagSelector from '../../components/TagSelector'; // NEU: Unser smarter Import

export default function NewItem() {
  const router = useRouter();
  
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [locationId, setLocationId] = useState('');
  const [category, setCategory] = useState('ALLGEMEIN');
  const [ean, setEan] = useState('');
  
  // Tags werden jetzt durch unsere neue Komponente verwaltet
  const [tags, setTags] = useState<string[]>([]);

  const [attributes, setAttributes] = useState<Record<string, string>>({});
  const [learnedAttributes, setLearnedAttributes] = useState<Record<string, string[]>>({});
  
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
    };
    fetchData();
  }, []);

  const handleCategoryChange = (val: string) => {
    setCategory(val);
    if (val === 'MASCHINE') setShowWarranty(true);
    else if (val === 'SCHRAUBE') setShowWarranty(false);
  };

  const updateAttribute = (key: string, value: string) => {
    setAttributes(prev => ({ ...prev, [key]: value }));
  };

  const renderAttributeInput = (label: string, key: string, placeholder: string, defaultOptions: string[] = []) => {
    const learned = learnedAttributes[key] || [];
    const combinedOptions = Array.from(new Set([...defaultOptions, ...learned])).sort();
    const listId = `datalist-${key}`;
    return (
      <div className="col-span-1">
        <label className="text-xs text-slate-500 block mb-1">{label}</label>
        <input type="text" list={listId} placeholder={placeholder} value={attributes[key] || ''} onChange={e => updateAttribute(key, e.target.value)} className="w-full p-2 border border-slate-300 rounded-md bg-white text-slate-900 text-sm outline-none" />
        <datalist id={listId}>{combinedOptions.map(opt => <option key={opt} value={opt} />)}</datalist>
      </div>
    );
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
        tags, // Hier speichern wir die smarten Tags in der DB!
        quantity,
        locationId,
        category,
        attributes,
        ean,
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

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-xl mx-auto bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <h1 className="text-2xl font-bold text-slate-800 mb-6">Neues Werkzeug</h1>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          
          <div className="space-y-4">
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full p-3 border border-slate-300 rounded-xl bg-white text-slate-900 outline-none font-bold text-lg" placeholder="Bezeichnung (z.B. Makita Flex)" required />
            
            {/* HIER IST DIE NEUE MAGIE EINGEBAUT */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Was genau ist das? (Klicken zum Auswählen)</label>
              <TagSelector selectedTags={tags} onTagsChange={setTags} />
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Menge</label>
                <input type="number" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className="w-full p-3 border border-slate-300 rounded-xl bg-white text-slate-900" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Lagerort</label>
                <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="w-full p-3 border border-slate-300 rounded-xl bg-white text-slate-900" required>
                  <option value="">-- Ort wählen --</option>
                  {/* Hilfsfunktion (am besten vor dem return einbauen): */}
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
  const hierarchicalLocs = buildTree(null, 0);

  return hierarchicalLocs.map(loc => (
    <option key={loc.id} value={loc.id}>
      {'\u00A0\u00A0\u00A0'.repeat(loc.depth)}{loc.depth > 0 ? '↳ ' : ''}{loc.name}
    </option>
  ));
})()}
                </select>
              </div>
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <label className="block text-sm font-medium text-slate-700 mb-2">Spezifische Attribute</label>
            <select value={category} onChange={(e) => handleCategoryChange(e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg bg-white text-slate-900 mb-4">
              <option value="ALLGEMEIN">📦 Keine spezifischen Felder</option>
              <option value="SCHRAUBE">🔩 Schraube / Befestigung</option>
              <option value="MASCHINE">🔌 Maschine / Elektro</option>
            </select>
            {category === 'SCHRAUBE' && (
              <div className="grid grid-cols-2 gap-3">
                {renderAttributeInput('Länge (mm)', 'Länge (mm)', '40')}
                {renderAttributeInput('Durchmesser', 'Durchmesser', '4')}
              </div>
            )}
            {category === 'MASCHINE' && (
              <div className="grid grid-cols-2 gap-3">
                {renderAttributeInput('Leistung', 'Leistung', '18V')}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 px-1 border-t pt-4">
            <input 
              type="checkbox" 
              id="toggleWarranty" 
              checked={showWarranty} 
              onChange={(e) => setShowWarranty(e.target.checked)} 
              className="w-5 h-5 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
            />
            <label htmlFor="toggleWarranty" className="text-sm font-semibold text-slate-700 cursor-pointer">
              🧾 Garantie & Beleg erfassen
            </label>
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