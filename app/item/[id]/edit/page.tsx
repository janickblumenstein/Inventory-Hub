"use client";

import { useState, useEffect, Suspense } from 'react';
import { db } from '../../../../lib/firebase'; 
import { doc, getDoc, updateDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';
import { useRouter, useParams } from 'next/navigation';

function EditItemForm() {
  const router = useRouter();
  const { id } = useParams();
  
  const [name, setName] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [locationId, setLocationId] = useState(''); 
  const [ean, setEan] = useState('');
  const [locations, setLocations] = useState<any[]>([]); 
  const [isSaving, setIsSaving] = useState(false);

  // Daten laden
  useEffect(() => {
    const fetchData = async () => {
      // 1. Lagerorte laden
      const locSnapshot = await getDocs(collection(db, 'locations'));
      const locs: any[] = [];
      locSnapshot.forEach((doc) => { locs.push({ id: doc.id, ...doc.data() }); });
      setLocations(locs);

      // 2. Item Daten laden
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
        }
      }
    };
    fetchData();
  }, [id]);

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const itemRef = doc(db, 'items', id as string);
      await updateDoc(itemRef, {
        name,
        tags,
        quantity,
        ean,
        locationId
      });
      router.push(`/item/${id}`); 
    } catch (error) {
      alert('Fehler beim Speichern.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (confirm("Möchtest du dieses Item wirklich dauerhaft löschen?")) {
      await deleteDoc(doc(db, 'items', id as string));
      router.push('/');
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Bezeichnung</label>
        {/* FIX: text-slate-900 für bessere Lesbarkeit im Dark Mode */}
        <input 
          type="text" 
          value={name} 
          onChange={(e) => setName(e.target.value)} 
          className="w-full p-2 border border-slate-300 rounded-lg bg-white text-slate-900 outline-none focus:ring-2 focus:ring-orange-500" 
          required 
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Menge</label>
        <input 
          type="number" 
          value={quantity} 
          onChange={(e) => setQuantity(Number(e.target.value))} 
          className="w-32 p-2 border border-slate-300 rounded-lg bg-white text-slate-900" 
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Lagerort</label>
        <select 
          value={locationId} 
          onChange={(e) => setLocationId(e.target.value)} 
          className="w-full p-2 border border-slate-300 rounded-lg bg-white text-slate-900"
        >
          {locations.map(loc => (
            <option key={loc.id} value={loc.id}>{loc.name}</option>
          ))}
        </select>
      </div>

      <div className="pt-6 border-t flex flex-col gap-3">
        <button type="submit" disabled={isSaving} className="w-full bg-orange-600 text-white font-bold py-3 rounded-lg hover:bg-orange-700 disabled:opacity-50">
          {isSaving ? 'Speichert...' : 'Änderungen speichern'}
        </button>
        <button type="button" onClick={handleDelete} className="w-full bg-red-50 text-red-600 font-medium py-2 rounded-lg hover:bg-red-100 transition">
          Item löschen
        </button>
      </div>
    </form>
  );
}

export default function EditItem() {
  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-xl mx-auto bg-white p-6 rounded-xl shadow-sm border border-slate-100">
        <h1 className="text-2xl font-bold mb-6 text-slate-800">Item bearbeiten</h1>
        <Suspense fallback={<div>Lade...</div>}>
          <EditItemForm />
        </Suspense>
      </div>
    </div>
  );
}