"use client";

import { useState, useEffect, Suspense } from 'react';
import { db, storage } from '../../../../lib/firebase'; 
import { doc, getDoc, updateDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import TagSelector from '../../../../components/TagSelector';

function EditItemForm() {
  const router = useRouter();
  const { id } = useParams();
  
  const [name, setName] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [locationId, setLocationId] = useState(''); 
  const [ean, setEan] = useState('');
  
  const [attributes, setAttributes] = useState<Record<string, string>>({});
  const [learnedAttributes, setLearnedAttributes] = useState<Record<string, string[]>>({});

  const [showWarranty, setShowWarranty] = useState(false);
  const [price, setPrice] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [receiptUrl, setReceiptUrl] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  const [locations, setLocations] = useState<any[]>([]); 
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
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

      // 3. Dieses Item laden
      if (id) {
        const itemRef = doc(db, 'items', id as string);
        const itemSnap = await getDoc(itemRef);
        if (itemSnap.exists()) {
          const data = itemSnap.data();
          setName(data.name || '');
          setTags(data.tags || []);
          setQuantity(data.quantity || 1);
          setLocationId(data.locationId || '');
          setEan(data.ean || '');
          setAttributes(data.attributes || {});
          
          setPrice(data.price || '');
          setPurchaseDate(data.purchaseDate || '');
          setReceiptUrl(data.receiptUrl || '');
          
          if (data.price || data.purchaseDate || data.receiptUrl) {
            setShowWarranty(true);
          }
        }
      }
    };
    fetchData();
  }, [id]);

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

      const itemRef = doc(db, 'items', id as string);
      await updateDoc(itemRef, {
        name,
        tags, // Speichert die neuen multidimensionalen Tags
        quantity,
        ean,
        locationId,
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
      await deleteDoc(doc(db, 'items', id as string));
      router.push('/');
    }
  };

  // Logik für smarte Felder basierend auf Tags
  const hasScrewTag = tags.some(t => t.toLowerCase().includes('schraube') || t.toLowerCase().includes('befestigung'));
  const hasMachineTag = tags.some(t => t.toLowerCase().includes('maschine') || t.toLowerCase().includes('säge') || t.toLowerCase().includes('schleifer') || t.toLowerCase().includes('akkuschrauber'));

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Bezeichnung</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full p-3 border border-slate-300 rounded-xl bg-white text-slate-900 outline-none font-bold text-lg" required />
        </div>

        {/* DER NEUE TAG SELECTOR */}
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
            <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="w-full p-3 border border-slate-300 rounded-xl bg-white text-slate-900">
              <option value="">-- Wählen --</option>
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

      {/* SMARTE ATTRIBUTE (Nur sichtbar, wenn passende Tags gewählt wurden) */}
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

      {/* TRESOR */}
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

      <div className="pt-6 flex flex-col gap-3">
        <button type="submit" disabled={isSaving} className="w-full bg-orange-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-orange-200 disabled:opacity-50 transition">
          {isSaving ? 'Speichert...' : 'Änderungen speichern'}
        </button>
        <button type="button" onClick={handleDelete} className="w-full bg-red-50 text-red-600 font-medium py-3 rounded-xl hover:bg-red-100 transition">Item löschen</button>
      </div>
    </form>
  );
}

export default function EditItem() {
  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-xl mx-auto bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-slate-800">Item bearbeiten</h1>
          <Link href="/" className="text-sm text-slate-500 hover:underline">Abbrechen</Link>
        </div>
        <Suspense fallback={<div className="text-center p-8 text-slate-500 animate-pulse">Lade...</div>}><EditItemForm /></Suspense>
      </div>
    </div>
  );
}