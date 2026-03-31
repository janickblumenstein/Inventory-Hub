"use client";

import { useEffect, useState } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import Link from 'next/link';

export default function Dashboard() {
  const [items, setItems] = useState<any[]>([]);
  const [locations, setLocations] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  
  // NEUE STATES FÜR SUCHE & FILTER
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState("ALL"); // ALL, WERKZEUG, VERBRAUCH, KRITISCH

  useEffect(() => {
    const fetchData = async () => {
      try {
        const locSnapshot = await getDocs(collection(db, 'locations'));
        const locMap: Record<string, string> = {}; 
        locSnapshot.forEach(doc => { locMap[doc.id] = doc.data().name; });
        setLocations(locMap);

        const itemSnapshot = await getDocs(collection(db, 'items'));
        const fetchedItems: any[] = [];
        itemSnapshot.forEach(doc => {
          fetchedItems.push({ id: doc.id, ...doc.data() });
        });
        
        fetchedItems.sort((a, b) => a.name.localeCompare(b.name));
        setItems(fetchedItems);
      } catch (error) {
        console.error("Fehler beim Laden:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) return <div className="p-8 text-center text-slate-500 animate-pulse mt-10">Lade smarte Werkstatt-Daten...</div>;

  const totalItems = items.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
  const lowStockCount = items.filter(item => item.quantity <= 2 && item.tags?.includes('Verbrauchsmaterial')).length;

  // HIER PASSIERT DIE FILTER-MAGIE
  const filteredItems = items.filter(item => {
    // 1. Text-Suche (ignoriert Groß-/Kleinschreibung)
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (item.tags && item.tags.join(' ').toLowerCase().includes(searchTerm.toLowerCase()));
    
    // 2. Klick-Filter
    let matchesFilter = true;
    if (activeFilter === "WERKZEUG") matchesFilter = item.tags?.includes('Werkzeug');
    if (activeFilter === "VERBRAUCH") matchesFilter = item.tags?.includes('Verbrauchsmaterial');
    if (activeFilter === "KRITISCH") matchesFilter = item.quantity <= 2 && item.tags?.includes('Verbrauchsmaterial');

    return matchesSearch && matchesFilter;
  });

  // Hilfsfunktion für das Ampelsystem
  const renderStatusBadge = (item: any) => {
    const isConsumable = item.tags?.includes('Verbrauchsmaterial');
    const qty = Number(item.quantity);

    // AMPEL FÜR VERBRAUCHSMATERIAL
    if (isConsumable) {
      if (qty <= 2) return <span className="bg-red-100 text-red-800 text-xs font-bold px-3 py-1 rounded-full">🔴 Fast leer</span>;
      if (qty <= 10) return <span className="bg-yellow-100 text-yellow-800 text-xs font-bold px-3 py-1 rounded-full">🟡 Wird knapp</span>;
      return <span className="bg-green-100 text-green-800 text-xs font-bold px-3 py-1 rounded-full">🟢 Genügend</span>;
    }
    
    // NORMALE ANZEIGE FÜR WERKZEUG
    return <span className="bg-slate-100 text-slate-700 text-xs font-medium px-3 py-1 rounded-full">Menge: {qty}</span>;
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 md:p-8">
      
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Werkstatt Hub</h1>
          <p className="text-sm text-slate-500 mt-1">Finde alles in Sekunden.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/locations/new" className="bg-slate-200 hover:bg-slate-300 text-slate-800 px-4 py-2 rounded-lg font-medium transition text-sm">
            + Ort
          </Link>
          <Link href="/new" className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg font-medium transition text-sm">
            + Item
          </Link>
        </div>
      </header>

      {/* NEU: SUCHE UND FILTER-PILLEN */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 mb-8 space-y-4">
        {/* Suchfeld */}
        <div className="relative">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">🔍</span>
          <input 
            type="text" 
            placeholder="Suchen nach Name, Schraube, Makita..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none bg-slate-50"
          />
        </div>

        {/* Filter Buttons */}
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setActiveFilter("ALL")} className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${activeFilter === "ALL" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
            Alle ({items.length})
          </button>
          <button onClick={() => setActiveFilter("WERKZEUG")} className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${activeFilter === "WERKZEUG" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
            🔧 Werkzeuge
          </button>
          <button onClick={() => setActiveFilter("VERBRAUCH")} className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${activeFilter === "VERBRAUCH" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
            🔩 Verbrauchsmaterial
          </button>
          <button onClick={() => setActiveFilter("KRITISCH")} className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${activeFilter === "KRITISCH" ? "bg-red-600 text-white shadow-sm" : "bg-red-50 text-red-600 hover:bg-red-100 border border-red-100"}`}>
            ⚠️ Kritisch ({lowStockCount})
          </button>
        </div>
      </div>

      {/* Echte Inventar-Liste (Jetzt gefiltert!) */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <h2 className="font-semibold text-slate-800">Ergebnisse</h2>
          <span className="text-xs text-slate-500">{filteredItems.length} Items gefunden</span>
        </div>
        
        <div className="divide-y divide-slate-100">
          {filteredItems.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-slate-500">Keine Items für diesen Filter oder diese Suche gefunden.</p>
              {searchTerm && <button onClick={() => setSearchTerm("")} className="mt-2 text-orange-600 hover:underline">Suche zurücksetzen</button>}
            </div>
          ) : (
            filteredItems.map(item => (
              <Link href={`/item/${item.id}`} key={item.id} className="flex justify-between items-center p-4 md:p-6 hover:bg-slate-50 transition-colors">
                <div className="pr-4">
                  <p className="font-medium text-slate-900 md:text-lg leading-tight">{item.name}</p>
                  <p className="text-xs text-slate-500 mt-1.5">
                    <span className="font-medium text-slate-700">📍 {locations[item.locationId] || 'Unbekannt'}</span> 
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {/* HIER WIRD DIE AMPEL / MENGE ANGEZEIGT */}
                  {renderStatusBadge(item)}
                  <span className="text-slate-400 text-xl hidden md:block">›</span>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}