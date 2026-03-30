// app/page.js
"use client";

import { useEffect, useState } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import Link from 'next/link';

export default function Dashboard() {
  const [items, setItems] = useState([]);
  const [locations, setLocations] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // 1. Hole alle Lagerorte (damit wir die Namen auf dem Dashboard anzeigen können)
        const locSnapshot = await getDocs(collection(db, 'locations'));
        const locMap = {};
        locSnapshot.forEach(doc => {
          locMap[doc.id] = doc.data().name;
        });
        setLocations(locMap);

        // 2. Hole alle echten Items aus deiner Datenbank
        const itemSnapshot = await getDocs(collection(db, 'items'));
        const fetchedItems = [];
        itemSnapshot.forEach(doc => {
          fetchedItems.push({ id: doc.id, ...doc.data() });
        });
        
        // Alphabetisch sortieren
        fetchedItems.sort((a, b) => a.name.localeCompare(b.name));
        
        setItems(fetchedItems);
      } catch (error) {
        console.error("Fehler beim Laden der Daten:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) return <div className="p-8 text-center text-slate-500 animate-pulse mt-10">Lade echte Werkstatt-Daten...</div>;

  // Echte Statistiken berechnen
  const totalItems = items.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
const lowStockCount = items.filter(item => 
  item.quantity <= 2 && item.tags?.includes('Verbrauchsmaterial')
).length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 md:p-8">
      
      {/* Header Bereich mit ECHTEN Links */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 border-b pb-4 gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Werkstatt Hub</h1>
          <p className="text-sm text-slate-500 mt-1">Deine Übersicht. Alles an seinem Platz.</p>
        </div>
        <div className="flex gap-3">
          <Link href="/locations/new" className="bg-slate-200 hover:bg-slate-300 text-slate-800 px-4 py-2 rounded-lg font-medium shadow-sm transition-colors text-sm">
            + Neuer Lagerort
          </Link>
          <Link href="/new" className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-colors text-sm">
            + Neues Item
          </Link>
        </div>
      </header>

      {/* Statistik-Karten (Jetzt mit echten Zahlen!) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h3 className="text-slate-500 text-sm font-medium">Gesamtbestand</h3>
          <p className="text-3xl font-bold mt-2">{totalItems}</p>
          <p className="text-xs text-green-600 mt-1">Teile erfasst</p>
        </div>
        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h3 className="text-slate-500 text-sm font-medium">Verschiedene Artikel</h3>
          <p className="text-3xl font-bold mt-2 text-blue-600">{items.length}</p>
          <p className="text-xs text-slate-500 mt-1">Im Inventar</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h3 className="text-slate-500 text-sm font-medium">Kritischer Bestand (&le; 2)</h3>
          <p className="text-3xl font-bold mt-2 text-red-600">{lowStockCount}</p>
          <p className="text-xs text-slate-500 mt-1">Items evtl. nachbestellen</p>
        </div>
      </div>

      {/* Echte Inventar-Liste */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <h2 className="font-semibold text-slate-800">Dein Inventar</h2>
        </div>
        
        <div className="divide-y divide-slate-100">
          {items.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-slate-500 mb-4">Du hast noch keine Items erfasst.</p>
              <Link href="/new" className="text-orange-600 font-medium hover:underline">Jetzt erstes Item anlegen &rarr;</Link>
            </div>
          ) : (
            items.map(item => (
              <Link href={`/item/${item.id}`} key={item.id} className="flex justify-between items-center p-6 hover:bg-slate-50 transition-colors">
                <div>
                  <p className="font-medium text-slate-900 text-lg">{item.name}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    <span className="font-semibold text-slate-700">Ort: {locations[item.locationId] || 'Unbekannt'}</span> 
                    {item.tags && item.tags.length > 0 ? ` • ${item.tags.join(', ')}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${item.quantity <= 2 ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                    Menge: {item.quantity}
                  </span>
                  <span className="text-slate-400 text-xl">›</span>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>

    </div>
  );
}