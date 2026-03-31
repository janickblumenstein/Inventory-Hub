"use client";

import { useEffect, useState, useMemo } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs, orderBy, query, writeBatch, doc } from 'firebase/firestore';
import Link from 'next/link';

export default function Dashboard() {
  const [items, setItems] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFilterTags, setSelectedFilterTags] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState<'location' | 'category' | 'none'>('location');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [bulkLocationId, setBulkLocationId] = useState('');
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [scannedLocationFilter, setScannedLocationFilter] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const locSnap = await getDocs(collection(db, 'locations'));
      const locList = locSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setLocations(locList);

      const itemsQuery = query(collection(db, 'items'), orderBy('createdAt', 'desc'));
      const itemsSnap = await getDocs(itemsQuery);
      
      const fetchedItems = itemsSnap.docs.map(document => {
        const data = document.data();
        return { id: document.id, ...data, locationId: data.locationId || '' } as any;
      });
      setItems(fetchedItems);
      
      const initialExpanded: Record<string, boolean> = {};
      fetchedItems.forEach(item => {
        initialExpanded[getRootLocationName(item.locationId, locList)] = true;
        initialExpanded[item.category || 'ALLGEMEIN'] = true;
      });
      setExpandedGroups(initialExpanded);
    } catch (error) {
      console.error("Fehler:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { 
    fetchData(); 
    
    // Prüfen, ob wir vom Scanner kommen
    const params = new URLSearchParams(window.location.search);
    const scannedLoc = params.get('scannedLoc');
    if (scannedLoc) {
      setScannedLocationFilter(scannedLoc);
      setGroupBy('location'); // Automatisch auf die "Ort"-Gruppierung wechseln
    }
  }, []);

  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    items.forEach(item => { if (item.tags) item.tags.forEach((t: string) => tags.add(t)); });
    return Array.from(tags).sort();
  }, [items]);

  const toggleFilterTag = (tag: string) => {
    setSelectedFilterTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const toggleGroup = (groupName: string) => {
    setExpandedGroups(prev => ({ ...prev, [groupName]: !prev[groupName] }));
  };

  const getRootLocationName = (locId: string, allLocs: any[]): string => {
    const loc = allLocs.find(l => l.id === locId);
    if (!loc) return 'Ohne Lagerort';
    if (!loc.parentId) return loc.name;
    return getRootLocationName(loc.parentId, allLocs);
  };

  const getSubPath = (locId: string, allLocs: any[]): string => {
    const loc = allLocs.find(l => l.id === locId);
    if (!loc || !loc.parentId) return '';
    const buildPath = (currentLoc: any): string => {
      if (!currentLoc.parentId) return '';
      const parent = allLocs.find(l => l.id === currentLoc.parentId);
      const parentStr = parent ? buildPath(parent) : '';
      return parentStr ? `${parentStr} > ${currentLoc.name}` : currentLoc.name;
    };
    return buildPath(loc);
  };

const filteredItems = useMemo(() => {
    return items.filter(item => {
      // 1. NEU: Wenn vom Scanner ein Ort gefiltert wird, schließe alles andere aus!
      if (scannedLocationFilter && item.locationId !== scannedLocationFilter) {
        return false;
      }

      // 2. Normale Text- und Tag-Suche
      const matchesSearch = searchTerm === "" || 
        item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.tags?.some((tag: string) => tag.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesChips = selectedFilterTags.length === 0 || 
        selectedFilterTags.every(filterTag => item.tags?.includes(filterTag));
      return matchesSearch && matchesChips;
    });
  }, [items, searchTerm, selectedFilterTags, scannedLocationFilter]); // Wichtig: State hier ergänzen!

  const groupedItems = useMemo(() => {
    if (groupBy === 'none') return { 'Alle Items': filteredItems };
    const groups: Record<string, any[]> = {};
    filteredItems.forEach(item => {
      let key = 'Unbekannt';
      if (groupBy === 'location') {
        key = getRootLocationName(item.locationId, locations);
        item.subPath = getSubPath(item.locationId, locations); 
      } else if (groupBy === 'category') {
        if (item.category === 'SCHRAUBE') key = '🔩 Schrauben & Befestigung';
        else if (item.category === 'MASCHINE') key = '🔌 Maschinen';
        else if (item.category === 'FLÜSSIGKEIT') key = '🛢️ Flüssigkeiten & Chemie';
        else key = '📦 Allgemeines Werkzeug';
      }
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    return Object.keys(groups).sort().reduce((acc, key) => { acc[key] = groups[key]; return acc; }, {} as Record<string, any[]>);
  }, [filteredItems, groupBy, locations]);

  const toggleItemSelection = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    const newSet = new Set(selectedItemIds);
    if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
    setSelectedItemIds(newSet);
  };

  // ==========================================
  // NEU: GRUPPE KOMPLETT AUSWÄHLEN
  // ==========================================
  const toggleGroupSelection = (itemsInGroup: any[], e: React.MouseEvent) => {
    e.stopPropagation(); // Verhindert, dass das Akkordeon auf/zu klappt
    const groupItemIds = itemsInGroup.map(i => i.id);
    
    // Prüfen, ob bereits ALLE Items dieser Gruppe ausgewählt sind
    const allSelected = groupItemIds.every(id => selectedItemIds.has(id));
    
    const newSet = new Set(selectedItemIds);
    if (allSelected) {
      // Wenn alle an sind -> Alle ausmachen
      groupItemIds.forEach(id => newSet.delete(id));
    } else {
      // Wenn nicht alle an sind -> Alle anmachen
      groupItemIds.forEach(id => newSet.add(id));
    }
    setSelectedItemIds(newSet);
  };

  const handleBulkMove = async () => {
    if (selectedItemIds.size === 0 || !bulkLocationId) return;
    setIsBulkUpdating(true);
    try {
      const batch = writeBatch(db);
      selectedItemIds.forEach(id => {
        const itemRef = doc(db, 'items', id);
        batch.update(itemRef, { locationId: bulkLocationId });
      });
      await batch.commit();
      setSelectedItemIds(new Set());
      setIsSelectionMode(false);
      setBulkLocationId('');
      fetchData();
    } catch (error) {
      alert("Fehler beim Verschieben.");
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const getHierarchicalLocations = () => {
    const buildTree = (parentId: string | null, depth: number): any[] => {
      let result: any[] = [];
      const children = locations.filter(l => (l.parentId || null) === parentId);
      children.forEach(child => {
        result.push({ ...child, depth });
        result = result.concat(buildTree(child.id, depth + 1));
      });
      return result;
    };
    return buildTree(null, 0);
  };

  if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500">Lade Inventar...</div>;

  return (
    <div className={`min-h-screen bg-slate-50 ${isSelectionMode ? 'pb-32' : 'pb-20'}`}>
      {/* HEADER - Verschlankt für mobile Displays */}
      <header className="bg-slate-900 text-white pt-6 pb-6 px-4 md:px-8 shadow-md transition-all sticky top-0 z-40">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          
          <div className="min-w-0 pr-2">
          <h1 className="text-xl sm:text-2xl font-black tracking-tight flex items-center gap-1.5 truncate">
              <svg className="w-6 h-6 sm:w-8 sm:h-8 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              <span className="text-orange-500 ml-1">Shed</span>
              <span className="text-white">Sync</span>
            </h1>
          </div>
          
          <div className="flex gap-1.5 sm:gap-2 items-center shrink-0">
            {/* Massenmutation (Nur noch Icon) */}
            <button 
              onClick={() => { setIsSelectionMode(!isSelectionMode); setSelectedItemIds(new Set()); }}
              className={`p-2 sm:p-2.5 rounded-lg text-lg transition flex items-center justify-center ${isSelectionMode ? 'bg-orange-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
              title="Mehrere bearbeiten"
            >
              {isSelectionMode ? '❌' : '☑️'}
            </button>
            
            {!isSelectionMode && (
              <>
                {/* NEU: Verleih Übersicht */}
                <Link href="/loans" className="p-2 sm:p-2.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-lg transition" title="Verleih">🤝</Link>
                <Link href="/locations" className="p-2 sm:p-2.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-lg transition" title="Lagerorte">🏗️</Link>
                <Link href="/scanner" className="p-2 sm:p-2.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-lg transition" title="Scanner">📷</Link>
                <Link href="/new" className="bg-orange-600 hover:bg-orange-700 text-white font-bold p-2 sm:px-3 rounded-lg transition shadow-sm flex items-center justify-center">
                  <span className="text-xl leading-none">+</span>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 md:p-8 mt-4 relative">
        
            {/* NEU: Scanner-Filter Hinweis */}
        {scannedLocationFilter && (
          <div className="bg-orange-100 border border-orange-200 text-orange-900 p-4 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6 shadow-sm animate-fade-in">
            <span className="text-sm font-bold flex items-center gap-2">
              📷 Scanner aktiv: Zeige nur Inhalt dieses Lagerorts
            </span>
            <button 
              onClick={() => {
                setScannedLocationFilter(null);
                window.history.replaceState({}, '', '/'); // Bereinigt die URL
              }}
              className="bg-white px-4 py-2 rounded-lg text-xs font-bold shadow-sm hover:bg-orange-50 transition border border-orange-200"
            >
              ✖ Filter aufheben
            </button>
          </div>
        )}

{/* SUCHE & FILTER */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
          <input 
            type="text" 
            placeholder="🔍 Suchen nach Werkzeug oder Tag..." 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)} 
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 outline-none focus:ring-2 focus:ring-orange-500 mb-3" 
          />
          
          {/* DIE TAG-LEISTE (Scrollbar) */}
          {availableTags.length > 0 && (
            <div className="flex overflow-x-auto gap-2 pb-3 scrollbar-hide">
              {availableTags.map(tag => {
                const isSelected = selectedFilterTags.includes(tag);
                return (
                  <button 
                    key={tag} 
                    onClick={() => toggleFilterTag(tag)} 
                    className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                      isSelected 
                        ? 'bg-orange-100 text-orange-800 border-orange-300 shadow-inner' 
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {isSelected && '✓ '} {tag}
                  </button>
                );
              })}
            </div>
          )}
          
          {/* ANSICHTS-STEUERUNG */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
            <span className="text-sm font-medium text-slate-500">Ansicht:</span>
            <div className="flex bg-slate-100 p-1 rounded-lg">
              <button 
                onClick={() => setGroupBy('location')} 
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition ${groupBy === 'location' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                📍 Ort
              </button>
              <button 
                onClick={() => setGroupBy('category')} 
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition ${groupBy === 'category' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                🏷️ Typ
              </button>
            </div>
          </div>
        </div>

        {/* LISTEN-ANSICHT */}
        <div className="space-y-6">
          {Object.entries(groupedItems).map(([groupName, itemsInGroup]) => {
            // Prüfen, wie viele in dieser Gruppe gerade markiert sind
            const groupItemIds = itemsInGroup.map(i => i.id);
            const selectedInGroupCount = groupItemIds.filter(id => selectedItemIds.has(id)).length;
            const allSelected = selectedInGroupCount === itemsInGroup.length && itemsInGroup.length > 0;

            return (
              <div key={groupName} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                
                {/* AKKORDEON HEADER */}
                <div className="w-full flex justify-between items-center bg-slate-50/50 hover:bg-slate-100 transition border-b border-slate-100">
                  <button onClick={() => toggleGroup(groupName)} className="flex-1 flex items-center gap-3 p-4 text-left">
                    <span className="text-slate-400 font-mono text-xl leading-none w-4">{expandedGroups[groupName] ? '−' : '+'}</span>
                    <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 flex-wrap">
                      {groupName} 
                      {/* Zeigt den Code des Lagerorts dezent an */}
                      {groupBy === 'location' && locations.find(l => l.name === groupName)?.code && (
                        <span className="text-xs font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          {locations.find(l => l.name === groupName)?.code}
                        </span>
                      )}
                      <span className="text-xs font-normal text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200 ml-1">{itemsInGroup.length}</span>
                    </h2>
                  </button>

                  {/* NEU: "Alle auswählen" Button (nur im Auswahlmodus sichtbar) */}
                  {isSelectionMode && (
                    <div className="pr-4">
                      <button 
                        onClick={(e) => toggleGroupSelection(itemsInGroup, e)}
                        className={`text-xs font-bold px-3 py-1.5 rounded-md border transition-colors ${allSelected ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}
                      >
                        {allSelected ? '✓ Alle abwählen' : 'Alle auswählen'}
                      </button>
                    </div>
                  )}
                </div>

                {/* ITEMS */}
                {expandedGroups[groupName] && (
                  <div className="divide-y divide-slate-100">
                    {itemsInGroup.map(item => {
                      const isSelected = selectedItemIds.has(item.id);
                      const ItemWrapper = isSelectionMode ? 'div' : Link;
                      const wrapperProps = isSelectionMode 
                        ? { onClick: (e: any) => toggleItemSelection(item.id, e), className: `cursor-pointer block p-3 sm:p-4 transition group ${isSelected ? 'bg-orange-50' : 'hover:bg-slate-50'}` }
                        : { href: `/item/${item.id}`, className: "block p-3 sm:p-4 hover:bg-orange-50 transition group" };

                      return (
                        <ItemWrapper key={item.id} {...wrapperProps as any}>
                          <div className="flex items-center gap-4">
                            
                            {/* CHECKBOX */}
                            {isSelectionMode && (
                              <div className="shrink-0 flex items-center justify-center">
                                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-orange-600 border-orange-600' : 'border-slate-300 bg-white'}`}>
                                  {isSelected && <span className="text-white text-[10px] font-bold">✓</span>}
                                </div>
                              </div>
                            )}

                            <div className="flex-1 min-w-0">
                              <h3 className={`font-bold truncate transition ${isSelected ? 'text-orange-900' : 'text-slate-900 group-hover:text-orange-700'}`}>{item.name}</h3>
                              
                              {/* Sub-Path MIT Code anzeigen */}
                              {groupBy === 'location' && item.subPath && (
                                <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-100">
                                  📍 {item.subPath}
                                  {locations.find(l => l.id === item.locationId)?.code && (
                                    <span className="text-[9px] font-mono text-orange-400 opacity-80">
                                      [{locations.find(l => l.id === item.locationId)?.code}]
                                    </span>
                                  )}
                                </span>
                              )}

                              {/* Wenn nicht nach Ort gruppiert wird, zeige ebenfalls den Code */}
                              {groupBy !== 'location' && item.locationId && (
                                <span className="block mt-1 text-[10px] text-slate-400 truncate">
                                  📍 {getRootLocationName(item.locationId, locations)} {item.subPath && `> ${item.subPath}`}
                                  {locations.find(l => l.id === item.locationId)?.code && (
                                    <span className="font-mono ml-1 opacity-70">[{locations.find(l => l.id === item.locationId)?.code}]</span>
                                  )}
                                </span>
                              )}
                            </div>

                            <div className="text-right shrink-0">
                              <span className={`font-bold px-3 py-1 rounded-md border transition ${isSelected ? 'bg-orange-200 border-orange-300 text-orange-900' : 'bg-slate-100 text-slate-800 border-slate-200'}`}>
                                {item.quantity}x
                              </span>
                            </div>
                            
                          </div>
                        </ItemWrapper>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>

      {/* FLOATING ACTION BAR FÜR MASSENMUTATION */}
      {isSelectionMode && (
        <div className="fixed bottom-0 left-0 right-0 bg-slate-900 text-white p-4 shadow-[0_-10px_40px_rgba(0,0,0,0.2)] z-50 animate-slide-up border-t border-slate-700">
          <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center gap-4 justify-between">
            
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <span className="bg-orange-600 text-white font-bold px-3 py-1 rounded-full text-sm">
                {selectedItemIds.size} gewählt
              </span>
              <span className="text-slate-400 text-sm font-medium">verschieben nach:</span>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select 
                value={bulkLocationId} 
                onChange={(e) => setBulkLocationId(e.target.value)}
                className="flex-1 sm:w-64 p-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white outline-none text-sm"
              >
                <option value="">-- Zielort wählen --</option>
                {getHierarchicalLocations().map(loc => (
                  <option key={loc.id} value={loc.id}>
                    {'\u00A0\u00A0'.repeat(loc.depth)}{loc.depth > 0 ? '↳ ' : ''}{loc.name}
                  </option>
                ))}
              </select>

              <button 
                onClick={handleBulkMove}
                disabled={selectedItemIds.size === 0 || !bulkLocationId || isBulkUpdating}
                className="bg-orange-600 hover:bg-orange-500 text-white font-bold py-2.5 px-6 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shadow-lg"
              >
                {isBulkUpdating ? 'Verschiebe...' : 'Ausführen'}
              </button>
            </div>
            
          </div>
        </div>
      )}

    </div>
  );
}