"use client";

import { useEffect, useState, useMemo } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs, orderBy, query, writeBatch, doc, getDoc, setDoc, updateDoc, addDoc } from 'firebase/firestore';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import QRCode from 'react-qr-code';
import { useWorkspace } from '../context/WorkspaceContext';
import { tryPrintNative } from '../lib/brotherPrint';
import { getStockMode, getStockLevel, nextStockLevel, isLowStock, STOCK_LEVELS } from '../lib/stock';

// Such-URLs der Standard-Shops (für den Schnell-Link in der Einkaufsliste)
const SHOP_SEARCH_URLS: Record<string, string> = {
  galaxus: 'https://www.galaxus.ch/search?q=',
  hornbach: 'https://www.hornbach.ch/s/',
  migros: 'https://www.migros.ch/de/search?query=',
  coop: 'https://www.coop.ch/de/search/?text=',
  brack: 'https://www.brack.ch/search?query=',
  obi: 'https://www.obi.ch/search/',
};

export default function Dashboard() {
  const router = useRouter();
  // 1. WORKSPACE LOGIK
  const { workspaceId, setWorkspaceId, isLoading: isWorkspaceLoading } = useWorkspace();
  const [loginInput, setLoginInput] = useState('');

  // 2. DASHBOARD STATES
  const [items, setItems] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<any[]>([]);
  const [ownerName, setOwnerName] = useState('');
  const [brotherPrinter, setBrotherPrinter] = useState<any>(null);
  const [preferredShops, setPreferredShops] = useState<string[]>(['galaxus']);
  const [printItems, setPrintItems] = useState<any[]>([]);
  
  // 🔥 NEU: Tab Navigation
  const [activeTab, setActiveTab] = useState<'inventory' | 'inbox' | 'shopping'>('inventory');

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFilterTags, setSelectedFilterTags] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState<'location' | 'category' | 'none'>('location');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [scannedLocationFilter, setScannedLocationFilter] = useState<string | null>(null);

  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [bulkAction, setBulkAction] = useState<'location' | 'category' | 'addTag' | 'removeTag' | 'delete' | null>(null);
  const [bulkInputValue, setBulkInputValue] = useState('');

  // 3. DATEN LADEN
  const fetchData = async () => {
    if (!workspaceId) return; 
    
    setLoading(true);
    try {
      const workspaceRef = doc(db, 'workspaces', workspaceId);

      const locSnap = await getDocs(collection(workspaceRef, 'locations'));
      const locList = locSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setLocations(locList);
      
      const settingsSnap = await getDoc(doc(workspaceRef, 'settings', 'main'));
      if (settingsSnap.exists()) {
        const settingsData = settingsSnap.data();
        if (settingsData.categories) setCategories(settingsData.categories);
        setOwnerName(settingsData.ownerName || '');
        setBrotherPrinter(settingsData.brotherPrinter || null);
        setPreferredShops(settingsData.preferredShops || ['galaxus']);
      }

      const itemsQuery = query(collection(workspaceRef, 'items'), orderBy('createdAt', 'desc'));
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
      console.error("Fehler beim Laden der Workspace-Daten:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!workspaceId) return; 
    if (workspaceId) {
      fetchData(); 
      
      const params = new URLSearchParams(window.location.search);
      const scannedLoc = params.get('scannedLoc');
      if (scannedLoc) {
        setScannedLocationFilter(scannedLoc);
        setGroupBy('location'); 
      }
    }
  }, [workspaceId]);

  // 🔥 NEU: Tab-Spezifische Filterung
  const inboxItemsCount = items.filter(i => !i.category || i.category.trim() === '').length;
  const shoppingItemsCount = items.filter(i => i.onShoppingList === true).length;

  const currentTabItems = useMemo(() => {
    if (activeTab === 'inbox') return items.filter(i => !i.category || i.category.trim() === '');
    if (activeTab === 'shopping') return items.filter(i => i.onShoppingList === true);
    // Standard: Inventar (Nur sortierte Items ODER wenn wir im Shopping/Inbox waren, blenden wir sie hier aus)
    return items.filter(i => i.category && i.category.trim() !== '');
  }, [items, activeTab]);

  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    currentTabItems.forEach(item => { if (item.tags) item.tags.forEach((t: string) => tags.add(t)); });
    selectedFilterTags.forEach(t => tags.add(t));
    return Array.from(tags).sort();
  }, [currentTabItems, selectedFilterTags]);

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
    return currentTabItems.filter(item => {
      if (scannedLocationFilter && item.locationId !== scannedLocationFilter) return false;
      const matchesSearch = searchTerm === "" || 
        item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.ean?.includes(searchTerm) || // 🔥 NEU: EAN in Suche aufgenommen
        item.tags?.some((tag: string) => tag.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesChips = selectedFilterTags.length === 0 || 
        selectedFilterTags.every(filterTag => item.tags?.includes(filterTag));
      return matchesSearch && matchesChips;
    });
  }, [currentTabItems, searchTerm, selectedFilterTags, scannedLocationFilter]);

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
    if (allSelected) groupItemIds.forEach(id => newSet.delete(id));
    else groupItemIds.forEach(id => newSet.add(id));
    setSelectedItemIds(newSet);
  };

  const handleBulkExecute = async () => {
    if (selectedItemIds.size === 0 || !workspaceId) return;
    if (bulkAction !== 'delete' && !bulkInputValue.trim()) return;

    if (bulkAction === 'delete' && !confirm(`🚨 ACHTUNG: Willst du wirklich ${selectedItemIds.size} Items dauerhaft löschen?`)) return;

    setIsBulkUpdating(true);
    try {
      const batch = writeBatch(db);
      const wsRef = doc(db, 'workspaces', workspaceId); 
      
      selectedItemIds.forEach(id => {
        const itemRef = doc(collection(wsRef, 'items'), id); 
        
        if (bulkAction === 'delete') {
          batch.delete(itemRef);
        } else {
          const currentItem = items.find(i => i.id === id);
          if (bulkAction === 'location') batch.update(itemRef, { locationId: bulkInputValue });
          else if (bulkAction === 'category') {
            const cat = categories.find(c => c.id === bulkInputValue);
            if (cat) batch.update(itemRef, { category: cat.name });
          } else if (bulkAction === 'addTag') {
            const newTag = bulkInputValue.trim();
            const currentTags = currentItem?.tags || [];
            if (!currentTags.includes(newTag)) batch.update(itemRef, { tags: [...currentTags, newTag] });
          } else if (bulkAction === 'removeTag') {
            const tagToRemove = bulkInputValue.trim();
            const currentTags = currentItem?.tags || [];
            batch.update(itemRef, { tags: currentTags.filter((t: string) => t !== tagToRemove) });
          }
        }
      });

      await batch.commit();
      if (bulkAction === 'removeTag') setSelectedFilterTags(prev => prev.filter(t => t !== bulkInputValue.trim()));
      
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

  // 🏷️ Sammeldruck: QR-Etiketten aller markierten Items.
  // Nativ (Android-App): direkt per Bluetooth an den Brother-Drucker.
  // Sonst (PC/iPhone-Browser): window.print() (ein Label pro Tape-Abschnitt).
  const handlePrintLabels = async () => {
    const selected = items.filter(i => selectedItemIds.has(i.id));
    if (selected.length === 0) return;

    const handled = await tryPrintNative(
      selected.map(i => ({ id: i.id, name: i.name, tags: i.tags })),
      ownerName,
      brotherPrinter,
      window.location.origin
    );
    if (handled) return;

    setPrintItems(selected);
    setTimeout(() => { window.print(); }, 300);
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

  const handleLogout = () => {
    if(confirm("Möchtest du die Werkstatt wirklich verlassen?")) {
      localStorage.removeItem('shedsync_workspace');
      window.location.reload();
    }
  };

  // ➕➖ Menge direkt in der Liste ändern (Einkaufs-Tab & Bestandspflege).
  // Fällt der Bestand auf/unter den Mindestbestand, automatisch auf die Einkaufsliste.
  const changeItemQuantity = async (itemId: string, delta: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!workspaceId) return;
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    const newQty = Math.max(0, (Number(item.quantity) || 0) + delta);

    const hitsMinimum = item.minQuantity != null && newQty <= Number(item.minQuantity) && !item.onShoppingList;
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, quantity: newQty, onShoppingList: hitsMinimum ? true : i.onShoppingList } : i));
    try {
      const update: any = { quantity: newQty };
      if (hitsMinimum) update.onShoppingList = true;
      await updateDoc(doc(db, 'workspaces', workspaceId, 'items', itemId), update);
      // Bewegung loggen (Basis für den Ø-Verbrauch)
      addDoc(collection(db, 'workspaces', workspaceId, 'items', itemId, 'movements'), {
        delta,
        at: new Date().toISOString(),
      }).catch(() => {});
    } catch {
      alert('Fehler beim Speichern der Menge.');
    }
  };

  // ⚠️ Items mit Nachschubbedarf (Zähl- oder Füllstand-Modus), die noch
  // nicht auf der Einkaufsliste stehen
  const lowStockItems = useMemo(
    () => items.filter(i => isLowStock(i) && !i.onShoppingList),
    [items]
  );

  // 🟢→🔵→🟠→🔴 Füllstand direkt in der Liste durchtippen
  const cycleStockLevel = async (itemId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!workspaceId) return;
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    const level = nextStockLevel(getStockLevel(item));
    const update: any = { stockLevel: level };
    if ((level === 'low' || level === 'empty') && !item.onShoppingList) update.onShoppingList = true;
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, ...update } : i));
    try {
      await updateDoc(doc(db, 'workspaces', workspaceId, 'items', itemId), update);
    } catch {
      alert('Fehler beim Speichern.');
    }
  };

  const handleAddLowStockToShopping = async () => {
    if (!workspaceId || lowStockItems.length === 0) return;
    try {
      const batch = writeBatch(db);
      lowStockItems.forEach(i => batch.update(doc(db, 'workspaces', workspaceId, 'items', i.id), { onShoppingList: true }));
      await batch.commit();
      setItems(prev => prev.map(i => lowStockItems.some(l => l.id === i.id) ? { ...i, onShoppingList: true } : i));
    } catch {
      alert('Fehler beim Aktualisieren.');
    }
  };

  // 🔍 Schnell-Link in den Shop: gespeicherter Produktlink oder Suche im Lieblings-Shop
  const getShopUrl = (item: any): string => {
    if (item.productUrl) return item.productUrl;
    const pattern = SHOP_SEARCH_URLS[preferredShops[0]] || SHOP_SEARCH_URLS.galaxus;
    return `${pattern}${encodeURIComponent(item.name || '')}`;
  };

  // 📋 Ganze Einkaufsliste teilen (Bring!, WhatsApp …) – sonst kopieren.
  const handleCopyShoppingList = async () => {
    const list = items
      .filter(i => i.onShoppingList)
      .map(i => `${i.quantity || 1}x ${i.name || 'Item'}`)
      .join('\n');
    if (!list) return;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Einkaufsliste', text: list });
        return;
      } catch { /* abgebrochen -> Fallback */ }
    }
    try {
      await navigator.clipboard.writeText(list);
      alert(`✅ Einkaufsliste kopiert (${shoppingItemsCount} Positionen).\n\nJetzt in Bring!, WhatsApp o.ä. einfügen.`);
    } catch {
      alert('Teilen/Kopieren fehlgeschlagen.');
    }
  };

  // 🔥 NEU: Einkaufsliste Toggle Funktion
  const toggleShoppingListStatus = async (itemId: string, currentState: boolean, e: React.MouseEvent) => {
    e.preventDefault(); // Verhindert Navigation in die Detailansicht
    e.stopPropagation();
    if (!workspaceId) return;
    
    setItems(items.map(item => item.id === itemId ? { ...item, onShoppingList: !currentState } : item));
    try {
      await updateDoc(doc(db, 'workspaces', workspaceId, 'items', itemId), { onShoppingList: !currentState });
    } catch (error) {
      alert("Fehler beim Aktualisieren.");
    }
  };

  // ==========================================
  // RENDER: DER LOGIN-SCREEN
  // ==========================================
  if (isWorkspaceLoading) return <div className="min-h-screen bg-slate-50 p-8 flex items-center justify-center text-slate-500 font-medium">Lade ShedSync...</div>;

  if (!workspaceId) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-2xl max-w-md w-full text-center">
          <div className="flex justify-center mb-6">
            <svg className="w-16 h-16 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <h1 className="text-3xl font-black text-slate-900 mb-2">Shed<span className="text-orange-500">Sync</span></h1>
          <p className="text-slate-500 mb-8 font-medium">Welche Werkstatt möchtest du betreten?</p>
          
          <form onSubmit={(e) => { e.preventDefault(); if(loginInput.trim()) setWorkspaceId(loginInput.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-')); }}>
            <input 
              type="text" 
              placeholder="Workspace-ID (z.B. janick-hq)" 
              value={loginInput}
              onChange={(e) => setLoginInput(e.target.value)}
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-center text-lg font-bold text-slate-900 outline-none focus:border-orange-500 mb-4"
              required
            />
            <button type="submit" className="w-full bg-orange-600 hover:bg-orange-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-orange-200/50 transition text-lg">
              Eintreten
            </button>
          </form>
          <p className="text-xs text-slate-400 mt-6">Gib eine neue ID ein, um eine leere Werkstatt zu gründen.</p>
        </div>
      </div>
    );
  }

  // ==========================================
  // RENDER: DAS ECHTE DASHBOARD
  // ==========================================
  if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500 font-medium">Lade Werkstatt '{workspaceId}'...</div>;

  return (
    <>
    <div className={`min-h-screen bg-slate-50 print:hidden ${isSelectionMode ? 'pb-40' : 'pb-20'}`}>

      <header className="bg-slate-900 text-white pt-6 pb-6 px-4 md:px-8 shadow-md transition-all sticky top-0 z-40">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          
          <div className="min-w-0 pr-2">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight flex items-center gap-1.5 truncate cursor-pointer hover:opacity-80" onClick={handleLogout} title="Workspace verlassen">
              <svg className="w-6 h-6 sm:w-8 sm:h-8 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              {/* Logo-Text auf sehr schmalen Screens ausblenden, damit er nicht mit dem Menü kollidiert */}
              <span className="text-orange-500 ml-1 max-[430px]:hidden">Shed</span>
              <span className="text-white max-[430px]:hidden">Sync</span>
            </h1>
          </div>

          <div className="flex gap-1 sm:gap-2 items-center shrink-0">
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
                <Link href="/purchases" className="p-1.5 sm:p-2.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-base sm:text-lg transition" title="Käufe & Garantie">🧾</Link>
                <Link href="/loans" className="p-1.5 sm:p-2.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-base sm:text-lg transition" title="Verleih">🤝</Link>
                <Link href="/locations" className="p-1.5 sm:p-2.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-base sm:text-lg transition" title="Lagerorte">🏗️</Link>
                <Link href="/scanner" className="p-1.5 sm:p-2.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-base sm:text-lg transition" title="Scanner">📷</Link>
                <Link href="/new" className="bg-orange-600 hover:bg-orange-700 text-white font-bold p-1.5 sm:px-3 rounded-lg transition shadow-sm flex items-center justify-center">
                  <span className="text-xl leading-none">+</span>
                </Link>
                <Link href="/settings" className="p-1.5 sm:p-2.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-base sm:text-lg transition" title="Einstellungen">⚙️</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 md:p-8 mt-4 relative">
        
        {/* 🔥 NEU: DIE TABS (Inventar, Inbox, Shopping) */}
        <div className="flex gap-2 p-1 bg-slate-200/50 rounded-xl mb-6 overflow-x-auto hide-scrollbar">
          <button 
            onClick={() => { setActiveTab('inventory'); setSelectedItemIds(new Set()); }}
            className={`flex-1 py-2.5 px-4 rounded-lg font-bold text-sm whitespace-nowrap transition-all ${activeTab === 'inventory' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
          >
            📦 Inventar
          </button>
          
          <button 
            onClick={() => { setActiveTab('inbox'); setSelectedItemIds(new Set()); }}
            className={`flex-1 py-2.5 px-4 rounded-lg font-bold text-sm whitespace-nowrap transition-all flex items-center justify-center gap-2 ${activeTab === 'inbox' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
          >
            📥 Inbox 
            {inboxItemsCount > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] ${activeTab === 'inbox' ? 'bg-orange-100 text-orange-700' : 'bg-slate-300 text-slate-600'}`}>
                {inboxItemsCount}
              </span>
            )}
          </button>
          
          <button 
            onClick={() => { setActiveTab('shopping'); setSelectedItemIds(new Set()); }}
            className={`flex-1 py-2.5 px-4 rounded-lg font-bold text-sm whitespace-nowrap transition-all flex items-center justify-center gap-2 ${activeTab === 'shopping' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
          >
            🛒 Einkauf
            {shoppingItemsCount > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] ${activeTab === 'shopping' ? 'bg-red-100 text-red-700' : 'bg-slate-300 text-slate-600'}`}>
                {shoppingItemsCount}
              </span>
            )}
          </button>
        </div>

        {/* ⚠️ NACHSCHUB-WARNUNG (Mindestbestand unterschritten) */}
        {activeTab === 'inventory' && lowStockItems.length > 0 && (
          <div className="bg-red-50 border border-red-200 text-red-900 p-4 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6 shadow-sm">
            <span className="text-sm font-bold">
              ⚠️ {lowStockItems.length} {lowStockItems.length === 1 ? 'Item ist' : 'Items sind'} unter dem Mindestbestand:
              <span className="font-normal"> {lowStockItems.slice(0, 3).map(i => i.name).join(', ')}{lowStockItems.length > 3 ? ' …' : ''}</span>
            </span>
            <button
              onClick={handleAddLowStockToShopping}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-sm transition whitespace-nowrap"
            >
              🛒 Auf Einkaufsliste
            </button>
          </div>
        )}

        {/* 📋 EINKAUFSLISTE TEILEN */}
        {activeTab === 'shopping' && shoppingItemsCount > 0 && (
          <button
            onClick={handleCopyShoppingList}
            className="w-full mb-6 bg-white border border-slate-200 hover:border-orange-300 text-slate-700 font-bold py-3 rounded-xl shadow-sm transition flex items-center justify-center gap-2"
          >
            📤 Ganze Liste teilen <span className="text-xs font-normal text-slate-400">(Bring!, WhatsApp …)</span>
          </button>
        )}

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

        {/* SUCHE & FILTER */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
          <input 
            type="text" 
            placeholder={activeTab === 'inbox' ? "🔍 Suchen in der Inbox..." : "🔍 Suchen nach Werkzeug, Tag oder EAN..."}
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

        {/* DIE LISTEN ANSICHT (Funktioniert für alle Tabs!) */}
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
                        : { href: activeTab === 'inbox' ? `/item/${item.id}/edit` : `/item/${item.id}`, className: "block p-3 sm:p-4 hover:bg-orange-50 transition group" };

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

                            {/* ITEM BILD (Neu, aus der Inbox übernommen) */}
                            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-slate-50 border border-slate-200 rounded-lg shrink-0 overflow-hidden flex items-center justify-center p-1 relative">
                              {activeTab === 'inbox' && <div className="absolute top-1 left-1 w-2 h-2 bg-red-500 rounded-full animate-pulse z-10"></div>}
                              {item.imageUrl ? (
                                <img src={item.imageUrl} alt={item.name} className="w-full h-full object-contain mix-blend-multiply" />
                              ) : (
                                <span className="opacity-40">{activeTab === 'inbox' ? '📸' : '📦'}</span>
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              <h3 className={`font-bold truncate transition flex items-center gap-2 ${isSelected ? 'text-orange-900' : 'text-slate-900 group-hover:text-orange-700'}`}>
                                {item.name || 'Unbenanntes Item'}
                                {isLowStock(item) && (
                                  <span className="text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold border border-red-200 shrink-0">⚠️ Nachschub</span>
                                )}
                              </h3>

                              {/* 🏷️ Tags als antippbare Filter-Chips */}
                              {item.tags && item.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {item.tags.slice(0, 4).map((tag: string) => (
                                    <button
                                      key={tag}
                                      type="button"
                                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFilterTag(tag); }}
                                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded border transition ${
                                        selectedFilterTags.includes(tag)
                                          ? 'bg-orange-100 text-orange-800 border-orange-300'
                                          : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                                      }`}
                                      title={`Nach "${tag}" filtern`}
                                    >
                                      {tag}
                                    </button>
                                  ))}
                                </div>
                              )}
                              
                              {item.ean && <p className="text-[10px] text-slate-500 font-mono mt-0.5">EAN: {item.ean}</p>}

                              {groupBy === 'location' && item.subPath && (
                                <button
                                  type="button"
                                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(`/locations/${item.locationId}`); }}
                                  className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-100 hover:bg-orange-100 hover:border-orange-300 transition"
                                  title="Lagerort öffnen"
                                >
                                  📍 {item.subPath}
                                  {locations.find(l => l.id === item.locationId)?.code && (
                                    <span className="text-[9px] font-mono text-orange-400 opacity-80">
                                      [{locations.find(l => l.id === item.locationId)?.code}]
                                    </span>
                                  )}
                                </button>
                              )}

                              {groupBy !== 'location' && item.locationId && (
                                <button
                                  type="button"
                                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(`/locations/${item.locationId}`); }}
                                  className="block mt-1 text-[10px] text-slate-500 truncate hover:text-orange-600 transition text-left"
                                  title="Lagerort öffnen"
                                >
                                  📍 {getRootLocationName(item.locationId, locations)} {item.subPath && `> ${item.subPath}`}
                                </button>
                              )}
                            </div>

                            {/* STATUS & MENGE */}
                            <div className="text-right shrink-0 flex flex-col items-end gap-2">
                              
                              {/* 🛒 Einkaufslisten Herz */}
                              {!isSelectionMode && (
                                <button 
                                  onClick={(e) => toggleShoppingListStatus(item.id, item.onShoppingList, e)}
                                  className="text-lg hover:scale-110 transition p-1"
                                  title={item.onShoppingList ? 'Von Einkaufsliste entfernen' : 'Auf Einkaufsliste setzen'}
                                >
                                  {item.onShoppingList ? '❤️' : '🤍'}
                                </button>
                              )}

                              {getStockMode(item) === 'level' ? (
                                <button
                                  onClick={(e) => !isSelectionMode && cycleStockLevel(item.id, e)}
                                  className={`font-bold px-2.5 py-1 rounded-md border text-xs transition ${STOCK_LEVELS[getStockLevel(item)].badge} ${!isSelectionMode ? 'hover:scale-105 cursor-pointer' : ''}`}
                                  title="Antippen zum Weiterschalten (Voll → Ausreichend → Knapp → Leer)"
                                >
                                  {STOCK_LEVELS[getStockLevel(item)].emoji} {STOCK_LEVELS[getStockLevel(item)].label}
                                </button>
                              ) : getStockMode(item) === 'none' ? (
                                <span className="text-lg opacity-40" title="Ohne Bestandsführung">🧰</span>
                              ) : activeTab === 'shopping' && !isSelectionMode ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={(e) => changeItemQuantity(item.id, -1, e)}
                                    className="w-8 h-8 flex items-center justify-center bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-md text-slate-600 font-bold transition"
                                    title="Menge verringern"
                                  >−</button>
                                  <span className="font-bold px-2 py-1 rounded-md border bg-slate-100 text-slate-800 border-slate-200 min-w-[42px] text-center">
                                    {item.quantity}x
                                  </span>
                                  <button
                                    onClick={(e) => changeItemQuantity(item.id, 1, e)}
                                    className="w-8 h-8 flex items-center justify-center bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-md text-slate-600 font-bold transition"
                                    title="Menge erhöhen"
                                  >+</button>
                                </div>
                              ) : (
                                <span className={`font-bold px-3 py-1 rounded-md border transition ${isSelected ? 'bg-orange-200 border-orange-300 text-orange-900' : 'bg-slate-100 text-slate-800 border-slate-200'}`}>
                                  {item.quantity}x
                                </span>
                              )}

                              {activeTab === 'shopping' && !isSelectionMode && (
                                <a
                                  href={getShopUrl(item)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-1 rounded hover:bg-blue-100 transition"
                                >
                                  🔍 {item.productUrl ? 'Zum Produkt' : 'Im Shop suchen'}
                                </a>
                              )}

                              {activeTab === 'inbox' && !isSelectionMode && (
                                <span className="text-[10px] bg-orange-100 text-orange-700 px-2 py-1 rounded font-bold">✏️ Einsortieren</span>
                              )}
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
              <p className="text-slate-400 font-medium">Keine Items in diesem Tab gefunden.</p>
            </div>
          )}
        </div>
      </main>

      {/* FLOATING ACTION BAR FÜR MASSENMUTATION */}
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

            {!bulkAction && (
              <div className="flex flex-wrap gap-2 w-full justify-end">
                <button onClick={() => setBulkAction('location')} className="flex-1 sm:flex-none bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold py-2.5 px-3 rounded-lg border border-slate-600 transition">📍 Ort</button>
                <button onClick={() => setBulkAction('category')} className="flex-1 sm:flex-none bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold py-2.5 px-3 rounded-lg border border-slate-600 transition">🏷️ Typ</button>
                <button onClick={() => setBulkAction('addTag')} className="flex-1 sm:flex-none bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold py-2.5 px-3 rounded-lg border border-slate-600 transition">➕ Tag</button>
                <button onClick={() => setBulkAction('removeTag')} className="flex-1 sm:flex-none bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold py-2.5 px-3 rounded-lg border border-slate-600 transition">➖ Tag</button>
                <button onClick={handlePrintLabels} className="flex-1 sm:flex-none bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold py-2.5 px-3 rounded-lg border border-slate-600 transition">🏷️ Etiketten</button>
                <button onClick={() => setBulkAction('delete')} className="bg-red-900/50 hover:bg-red-800 text-red-400 hover:text-white text-xs font-bold py-2.5 px-3 rounded-lg border border-red-900/50 transition">🗑️</button>
              </div>
            )}

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

    {/* 🏷️ Sammeldruck: ein QR-Etikett pro markiertem Item */}
    <div className="hidden print:block">
      {printItems.map(it => (
        <div key={it.id} className="flex items-center gap-2 p-1" style={{ breakAfter: 'page', maxWidth: '70mm' }}>
          <QRCode value={`${typeof window !== 'undefined' ? window.location.origin : ''}/item/${it.id}`} size={64} level="M" />
          <div className="text-left min-w-0">
            <p className="text-sm font-black uppercase tracking-tight text-black leading-tight break-words">{it.name || 'Item'}</p>
            {it.tags && it.tags.length > 0 && (
              <p className="text-[9px] text-black mt-0.5">{it.tags.slice(0, 3).join(' · ')}</p>
            )}
          </div>
        </div>
      ))}
    </div>
    </>
  );
}