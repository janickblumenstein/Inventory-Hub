"use client";

import { useEffect, useState, useMemo } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs, orderBy, query, writeBatch, doc, getDoc } from 'firebase/firestore';
import Link from 'next/link';

export default function Dashboard() {
  const [items, setItems] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<any[]>([]);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFilterTags, setSelectedFilterTags] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState<'location' | 'category' | 'none'>('location');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [scannedLocationFilter, setScannedLocationFilter] = useState<string | null>(null);

  // Bulk-States
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [bulkAction, setBulkAction] = useState<'location' | 'category' | 'addTag' | 'removeTag' | 'delete' | null>(null);
  const [bulkInputValue, setBulkInputValue] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const locSnap = await getDocs(collection(db, 'locations'));
      const locList = locSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setLocations(locList);
      
      const settingsSnap = await getDoc(doc(db, 'settings', 'main'));
      if (settingsSnap.exists() && settingsSnap.data().categories) {
        setCategories(settingsSnap.data().categories);
      }

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
      setExpandedGroups({});
    } catch (error) {
      console.error("Fehler:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { 
    fetchData(); 
    
    const params = new URLSearchParams(window.location.search);
    const scannedLoc = params.get('scannedLoc');
    if (scannedLoc) {
      setScannedLocationFilter(scannedLoc);
      setGroupBy('location'); 
    }
  }, []);

  // Alle Tags der gesamten Werkstatt (für den Filter & Autocomplete)
  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    items.forEach(item => { if (item.tags) item.tags.forEach((t: string) => tags.add(t)); });
    
    // NEU: Aktive Filter-Tags IMMER anzeigen, damit der Button nicht verschwindet!
    selectedFilterTags.forEach(t => tags.add(t));
    
    return Array.from(tags).sort();
  }, [items, selectedFilterTags]); // Wichtig: selectedFilterTags als Abhängigkeit hinzufügen

  // NEU: Sammelt exakt die Tags, die auf den aktuell markierten Items liegen (fürs Entfernen)
  const tagsOnSelectedItems = useMemo(() => {
    const tags = new Set<string>();
    selectedItemIds.forEach(id => {
      const item = items.find(i => i.id === id);
      if (item && item.tags) item.tags.forEach((t: string) => tags.add(t));
    });
    return Array.from(tags).sort();
  }, [selectedItemIds, items]);

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
      if (scannedLocationFilter && item.locationId !== scannedLocationFilter) {
        return false;
      }
      const matchesSearch = searchTerm === "" || 
        item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.tags?.some((tag: string) => tag.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesChips = selectedFilterTags.length === 0 || 
        selectedFilterTags.every(filterTag => item.tags?.includes(filterTag));
      return matchesSearch && matchesChips;
    });
  }, [items, searchTerm, selectedFilterTags, scannedLocationFilter]);

  const groupedItems = useMemo(() => {
    if (groupBy === 'none') return { 'Alle Items': filteredItems };
    const groups: Record<string, any[]> = {};
    filteredItems.forEach(item => {
      let key = 'Unbekannt';
      if (groupBy === 'location') {
        key = getRootLocationName(item.locationId, locations);
        item.subPath = getSubPath(item.locationId, locations); 
      } else if (groupBy === 'category') {
        key = item.category || 'Allgemein (Ohne Typ)';
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

  const toggleGroupSelection = (itemsInGroup: any[], e: React.MouseEvent) => {
    e.stopPropagation();
    const groupItemIds = itemsInGroup.map(i => i.id);
    const allSelected = groupItemIds.every(id => selectedItemIds.has(id));
    
    const newSet = new Set(selectedItemIds);
    if (allSelected) {
      groupItemIds.forEach(id => newSet.delete(id));
    } else {
      groupItemIds.forEach(id => newSet.add(id));
    }
    setSelectedItemIds(newSet);
  };

  // ==========================================
  // DIE MULTI-TOOL BULK FUNKTION
  // ==========================================
  const handleBulkExecute = async () => {
    if (selectedItemIds.size === 0) return;
    if (bulkAction !== 'delete' && !bulkInputValue.trim()) return;

    if (bulkAction === 'delete') {
      if (!confirm(`🚨 ACHTUNG: Willst du wirklich ${selectedItemIds.size} Items dauerhaft löschen?`)) return;
    }

    setIsBulkUpdating(true);
    try {
      const batch = writeBatch(db);
      
      selectedItemIds.forEach(id => {
        const itemRef = doc(db, 'items', id);
        
        if (bulkAction === 'delete') {
          batch.delete(itemRef);
        } else {
          const currentItem = items.find(i => i.id === id);
          
          if (bulkAction === 'location') {
            batch.update(itemRef, { locationId: bulkInputValue });
          } else if (bulkAction === 'category') {
            const cat = categories.find(c => c.id === bulkInputValue);
            if (cat) batch.update(itemRef, { category: cat.name });
          } else if (bulkAction === 'addTag') {
            const newTag = bulkInputValue.trim();
            const currentTags = currentItem?.tags || [];
            if (!currentTags.includes(newTag)) {
              batch.update(itemRef, { tags: [...currentTags, newTag] });
            }
          } else if (bulkAction === 'removeTag') {
            const tagToRemove = bulkInputValue.trim();
            const currentTags = currentItem?.tags || [];
            batch.update(itemRef, { tags: currentTags.filter((t: string) => t !== tagToRemove) });
          }
        }
      });

      await batch.commit();
      
      // NEU: Wenn ein Tag gelöscht wurde, werfen wir ihn automatisch aus dem aktiven Filter
      if (bulkAction === 'removeTag') {
        setSelectedFilterTags(prev => prev.filter(t => t !== bulkInputValue.trim()));
      }

      setSelectedItemIds(new Set());
      setIsSelectionMode(false);
      setBulkAction(null);
      setBulkInputValue('');
      fetchData();
    } catch (error) {
      alert("Fehler bei der Massenbearbeitung.");
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

  if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500 font-medium">Lade Werkstatt...</div>;

  return (
    <div className={`min-h-screen bg-slate-50 ${isSelectionMode ? 'pb-40' : 'pb-20'}`}>
      
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
            <button 
              onClick={() => { 
                setIsSelectionMode(!isSelectionMode); 
                setSelectedItemIds(new Set()); 
                setBulkAction(null); 
                setBulkInputValue(''); 
              }}
              className={`p-2 sm:p-2.5 rounded-lg text-lg transition flex items-center justify-center ${isSelectionMode ? 'bg-orange-600 text-white shadow-inner' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
              title="Mehrere bearbeiten"
            >
              {isSelectionMode ? '❌' : '☑️'}
            </button>
            
            {!isSelectionMode && (
              <>
                <Link href="/loans" className="p-2 sm:p-2.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-lg transition" title="Verleih">🤝</Link>
                <Link href="/locations" className="p-2 sm:p-2.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-lg transition" title="Lagerorte">🏗️</Link>
                <Link href="/scanner" className="p-2 sm:p-2.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-lg transition" title="Scanner">📷</Link>
                <Link href="/new" className="bg-orange-600 hover:bg-orange-700 text-white font-bold p-2 sm:px-3 rounded-lg transition shadow-sm flex items-center justify-center">
                  <span className="text-xl leading-none">+</span>
                </Link>
                <Link href="/settings" className="p-2 sm:p-2.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-lg transition" title="Einstellungen">⚙️</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 md:p-8 mt-4 relative">
        
        {scannedLocationFilter && (
          <div className="bg-orange-100 border border-orange-200 text-orange-900 p-4 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6 shadow-sm animate-fade-in">
            <span className="text-sm font-bold flex items-center gap-2">
              📷 Scanner aktiv: Zeige nur Inhalt dieses Lagerorts
            </span>
            <button 
              onClick={() => {
                setScannedLocationFilter(null);
                window.history.replaceState({}, '', '/');
              }}
              className="bg-white text-slate-900 px-4 py-2 rounded-lg text-xs font-bold shadow-sm hover:bg-orange-50 transition border border-orange-200"
            >
              ✖ Filter aufheben
            </button>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
          <input 
            type="text" 
            placeholder="🔍 Suchen nach Werkzeug oder Tag..." 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)} 
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-orange-500 mb-3" 
          />
          
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
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {isSelected && '✓ '} {tag}
                  </button>
                );
              })}
            </div>
          )}
          
          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
            <span className="text-sm font-medium text-slate-500">Ansicht:</span>
            <div className="flex bg-slate-100 p-1 rounded-lg">
              <button onClick={() => setGroupBy('location')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition ${groupBy === 'location' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>📍 Ort</button>
              <button onClick={() => setGroupBy('category')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition ${groupBy === 'category' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>🏷️ Typ</button>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {Object.entries(groupedItems).map(([groupName, itemsInGroup]) => {
            const groupItemIds = itemsInGroup.map(i => i.id);
            const selectedInGroupCount = groupItemIds.filter(id => selectedItemIds.has(id)).length;
            const allSelected = selectedInGroupCount === itemsInGroup.length && itemsInGroup.length > 0;

            return (
              <div key={groupName} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                
                <div className="w-full flex justify-between items-center bg-slate-50/50 hover:bg-slate-100 transition border-b border-slate-100">
                  <button onClick={() => toggleGroup(groupName)} className="flex-1 flex items-center gap-3 p-4 text-left">
                    <span className="text-slate-400 font-mono text-xl leading-none w-4">{expandedGroups[groupName] ? '−' : '+'}</span>
                    <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 flex-wrap">
                      {groupBy === 'category' && (
                        <span className="text-xl mr-1">{categories.find(c => c.name === groupName)?.icon || '🏷️'}</span>
                      )}
                      {groupName}
                      {groupBy === 'location' && locations.find(l => l.name === groupName)?.code && (
                        <span className="text-xs font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          {locations.find(l => l.name === groupName)?.code}
                        </span>
                      )}
                      <span className="text-xs font-normal text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200 ml-1">{itemsInGroup.length}</span>
                    </h2>
                  </button>

                  {isSelectionMode && (
                    <div className="pr-4">
                      <button 
                        onClick={(e) => toggleGroupSelection(itemsInGroup, e)}
                        className={`text-xs font-bold px-3 py-1.5 rounded-md border transition-colors ${allSelected ? 'bg-orange-600 text-white border-orange-600 shadow-inner' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}
                      >
                        {allSelected ? '✓ Alle abwählen' : 'Alle auswählen'}
                      </button>
                    </div>
                  )}
                </div>
                
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
                            
                            {isSelectionMode && (
                              <div className="shrink-0 flex items-center justify-center">
                                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-orange-600 border-orange-600' : 'border-slate-300 bg-white'}`}>
                                  {isSelected && <span className="text-white text-[10px] font-bold">✓</span>}
                                </div>
                              </div>
                            )}

                            <div className="flex-1 min-w-0">
                              <h3 className={`font-bold truncate transition ${isSelected ? 'text-orange-900' : 'text-slate-900 group-hover:text-orange-700'}`}>{item.name}</h3>
                              
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

                              {groupBy !== 'location' && item.locationId && (
                                <span className="block mt-1 text-[10px] text-slate-500 truncate">
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
          {Object.keys(groupedItems).length === 0 && (
            <div className="text-center py-12 bg-white rounded-xl border border-slate-200 border-dashed">
              <p className="text-slate-400 font-medium">Keine Werkzeuge gefunden.</p>
            </div>
          )}
        </div>
      </main>

      {/* ========================================= */}
      {/* FLOATING ACTION BAR FÜR MASSENMUTATION */}
      {/* ========================================= */}
      {isSelectionMode && selectedItemIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-slate-900 text-white p-4 shadow-[0_-10px_40px_rgba(0,0,0,0.3)] z-50 animate-slide-up border-t border-slate-700 pb-safe">
          <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center gap-4 justify-between">
            
            <div className="flex items-center gap-3 w-full sm:w-auto shrink-0 justify-between sm:justify-start">
              <div className="flex items-center gap-2">
                <span className="bg-orange-600 text-white font-bold px-3 py-1 rounded-full text-sm">
                  {selectedItemIds.size}
                </span>
                <span className="text-slate-300 text-sm font-medium">markiert</span>
              </div>
              <button onClick={() => { setBulkAction(null); setBulkInputValue(''); }} className="text-xs font-bold text-slate-400 hover:text-white transition sm:hidden">
                Aktion abbrechen
              </button>
            </div>

            {/* Aktion auswählen */}
            {!bulkAction && (
              <div className="flex flex-wrap gap-2 w-full justify-end">
                <button onClick={() => setBulkAction('location')} className="flex-1 sm:flex-none bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold py-2.5 px-3 rounded-lg border border-slate-600 transition">📍 Ort</button>
                <button onClick={() => setBulkAction('category')} className="flex-1 sm:flex-none bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold py-2.5 px-3 rounded-lg border border-slate-600 transition">🏷️ Typ</button>
                <button onClick={() => setBulkAction('addTag')} className="flex-1 sm:flex-none bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold py-2.5 px-3 rounded-lg border border-slate-600 transition">➕ Tag</button>
                <button onClick={() => setBulkAction('removeTag')} className="flex-1 sm:flex-none bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold py-2.5 px-3 rounded-lg border border-slate-600 transition">➖ Tag</button>
                <button onClick={() => setBulkAction('delete')} className="bg-red-900/50 hover:bg-red-800 text-red-400 hover:text-white text-xs font-bold py-2.5 px-3 rounded-lg border border-red-900/50 transition">🗑️</button>
              </div>
            )}

            {/* Detail-Eingabe für die gewählte Aktion */}
            {bulkAction && (
              <div className="flex items-center gap-2 w-full sm:w-auto">
                {bulkAction === 'location' && (
                  <select value={bulkInputValue} onChange={e => setBulkInputValue(e.target.value)} className="flex-1 sm:w-64 p-2.5 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-900 outline-none focus:border-orange-500">
                    <option value="">-- Neuen Ort wählen --</option>
                    {getHierarchicalLocations().map(loc => (
                      <option key={loc.id} value={loc.id}>
                        {'\u00A0\u00A0'.repeat(loc.depth)}{loc.depth > 0 ? '↳ ' : ''}{loc.name}
                      </option>
                    ))}
                  </select>
                )}
                {bulkAction === 'category' && (
                  <select value={bulkInputValue} onChange={e => setBulkInputValue(e.target.value)} className="flex-1 sm:w-64 p-2.5 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-900 outline-none focus:border-orange-500">
                    <option value="">-- Neuen Typ wählen --</option>
                    {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>)}
                  </select>
                )}
                {bulkAction === 'addTag' && (
                  <div className="flex-1 sm:w-64 relative">
                    <input 
                      type="text" 
                      list="bulk-add-tags" 
                      value={bulkInputValue} 
                      onChange={e => setBulkInputValue(e.target.value)} 
                      placeholder="Tag hinzufügen (z.B. Defekt)" 
                      className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-900 placeholder-slate-400 outline-none focus:border-orange-500" 
                    />
                    <datalist id="bulk-add-tags">
                      {availableTags.map(tag => <option key={tag} value={tag} />)}
                    </datalist>
                  </div>
                )}
                {bulkAction === 'removeTag' && (
                  <select 
                    value={bulkInputValue} 
                    onChange={e => setBulkInputValue(e.target.value)} 
                    className="flex-1 sm:w-64 p-2.5 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-900 outline-none focus:border-orange-500"
                  >
                    <option value="">-- Tag zum Entfernen wählen --</option>
                    {tagsOnSelectedItems.length === 0 ? (
                      <option value="" disabled>Keine Tags auf diesen Items</option>
                    ) : (
                      tagsOnSelectedItems.map(tag => <option key={tag} value={tag}>{tag}</option>)
                    )}
                  </select>
                )}
                {bulkAction === 'delete' && (
                  <span className="flex-1 sm:w-64 text-sm font-bold text-red-400">🚨 Dauerhaft löschen!</span>
                )}
                
                <button 
                  onClick={handleBulkExecute} 
                  disabled={isBulkUpdating || (bulkAction !== 'delete' && !bulkInputValue.trim())} 
                  className="bg-orange-600 hover:bg-orange-500 text-white font-bold py-2.5 px-6 rounded-lg transition disabled:opacity-50 whitespace-nowrap shadow-md"
                >
                  {isBulkUpdating ? '...' : 'Ausführen'}
                </button>
                <button onClick={() => { setBulkAction(null); setBulkInputValue(''); }} className="hidden sm:block text-xs font-bold text-slate-400 hover:text-white transition ml-2">
                  Abbrechen
                </button>
              </div>
            )}
            
          </div>
        </div>
      )}

    </div>
  );
}