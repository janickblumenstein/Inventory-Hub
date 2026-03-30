import React from 'react';

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 md:p-8">
      
      {/* Header Bereich */}
      <header className="flex justify-between items-center mb-8 border-b pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Werkstatt Hub</h1>
          <p className="text-sm text-slate-500 mt-1">Willkommen zurück! Deine Übersicht.</p>
        </div>
        <button className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-colors">
          + Neues Item
        </button>
      </header>

      {/* Statistik-Karten (Summary Cards) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h3 className="text-slate-500 text-sm font-medium">Gesamtbestand</h3>
          <p className="text-3xl font-bold mt-2">1,248</p>
          <p className="text-xs text-green-600 mt-1">Items erfasst</p>
        </div>
        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h3 className="text-slate-500 text-sm font-medium">Aktuell Ausgeliehen</h3>
          <p className="text-3xl font-bold mt-2 text-orange-600">4</p>
          <p className="text-xs text-slate-500 mt-1">Warten auf Rückgabe</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h3 className="text-slate-500 text-sm font-medium">Kritischer Bestand</h3>
          <p className="text-3xl font-bold mt-2 text-red-600">2</p>
          <p className="text-xs text-slate-500 mt-1">Items nachbestellen</p>
        </div>
      </div>

      {/* Letzte Aktivitäten / Inventar-Vorschau */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <h2 className="font-semibold text-slate-800">Kürzlich hinzugefügt / bewegt</h2>
        </div>
        
        <div className="divide-y divide-slate-100">
          {/* Beispiel Item 1 */}
          <div className="flex justify-between items-center p-6 hover:bg-slate-50 transition-colors">
            <div>
              <p className="font-medium text-slate-900">Winkelschleifer Makita</p>
              <p className="text-xs text-slate-500">Werkzeug • Schrank A1</p>
            </div>
            <span className="bg-orange-100 text-orange-800 text-xs font-medium px-2.5 py-1 rounded-full">
              Ausgeliehen: Max
            </span>
          </div>

          {/* Beispiel Item 2 */}
          <div className="flex justify-between items-center p-6 hover:bg-slate-50 transition-colors">
            <div>
              <p className="font-medium text-slate-900">Senkkopfschrauben Torx 20</p>
              <p className="text-xs text-slate-500">Verbrauchsmaterial • Kiste 4</p>
            </div>
            <span className="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-1 rounded-full">
              Bestand: 250
            </span>
          </div>

           {/* Beispiel Item 3 */}
           <div className="flex justify-between items-center p-6 hover:bg-slate-50 transition-colors">
            <div>
              <p className="font-medium text-slate-900">Holzbohrer 8mm</p>
              <p className="text-xs text-slate-500">Verbrauchsmaterial • Regal B</p>
            </div>
            <span className="bg-red-100 text-red-800 text-xs font-medium px-2.5 py-1 rounded-full">
              Bestand: 2 (Kritisch)
            </span>
          </div>
        </div>
      </div>

    </div>
  );
}