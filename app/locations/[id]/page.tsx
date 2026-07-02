"use client";

import { useEffect, useState, use } from 'react';
import { db, storage } from '../../../lib/firebase';
import { doc, getDoc, collection, query, where, getDocs, writeBatch, updateDoc, addDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import QRCode from 'react-qr-code';
import { useWorkspace } from '../../../context/WorkspaceContext';
import { tryPrintLocationsNative } from '../../../lib/brotherPrint';
import { buildLocationLabelUrl } from '../../../lib/labelImage';

export default function LocationHub({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { workspaceId } = useWorkspace();
  const resolvedParams = use(params);
  const id = resolvedParams.id;

  const [location, setLocation] = useState<any>(null);
  const [parentLocation, setParentLocation] = useState<any>(null);
  const [itemsInLocation, setItemsInLocation] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Set-Generator States
  const [showGenerator, setShowGenerator] = useState(false);
  const [selectedChips, setSelectedChips] = useState<Set<string>>(new Set());
  const [isGenerating, setIsGenerating] = useState(false);
  
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [ownerName, setOwnerName] = useState('');
  const [brotherPrinter, setBrotherPrinter] = useState<any>(null);
  const [printFallback, setPrintFallback] = useState(false);

  // 📍 MARKER-STUDIO STATES
  const [showMarkerStudio, setShowMarkerStudio] = useState(false);
  const [activeMarkerItemId, setActiveMarkerItemId] = useState<string | null>(null);

  // 📸 FOTO-TAGGING STATES (Tippen zum Erfassen)
  const [showPhotoTagging, setShowPhotoTagging] = useState(false);
  const [pendingTag, setPendingTag] = useState<{ x: number; y: number } | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [isCreatingItem, setIsCreatingItem] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const fetchLocationAndItems = async () => {
    if (!workspaceId) return;
    try {
      const locRef = doc(db, 'workspaces', workspaceId, 'locations', id);
      const locSnap = await getDoc(locRef);
      if (locSnap.exists()) {
        const locData = locSnap.data();
        setLocation({ id: locSnap.id, ...locData });

        // Eltern-Ort für die Aufwärts-Navigation laden
        if (locData.parentId) {
          const parentSnap = await getDoc(doc(db, 'workspaces', workspaceId, 'locations', locData.parentId));
          setParentLocation(parentSnap.exists() ? { id: parentSnap.id, ...parentSnap.data() } : null);
        } else {
          setParentLocation(null);
        }
      } else {
        router.push('/locations');
        return;
      }

      const settingsSnap = await getDoc(doc(db, 'workspaces', workspaceId, 'settings', 'main'));
      if (settingsSnap.exists()) {
        const settingsData = settingsSnap.data();
        setOwnerName(settingsData.ownerName || '');
        setBrotherPrinter(settingsData.brotherPrinter || null);
        if (settingsData.categories) {
          setCategories(settingsData.categories);
          if (settingsData.categories.length > 0) setSelectedCategoryId(settingsData.categories[0].id);
        }
      }

      const itemsQ = query(collection(db, 'workspaces', workspaceId, 'items'), where('locationId', '==', id));
      const itemsSnap = await getDocs(itemsQ);
      setItemsInLocation(itemsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) { 
      console.error(error); 
    } finally { 
      setIsLoading(false); 
    }
  };

  useEffect(() => {
    fetchLocationAndItems();
  }, [id, workspaceId]);

  const toggleChip = (chip: string) => {
    const newChips = new Set(selectedChips);
    if (newChips.has(chip)) newChips.delete(chip);
    else newChips.add(chip);
    setSelectedChips(newChips);
  };

  const handleGenerateItems = async () => {
    const activeCat = categories.find(c => c.id === selectedCategoryId);
    if (!activeCat || selectedChips.size === 0 || !workspaceId) return;
    
    setIsGenerating(true);
    try {
      const batch = writeBatch(db);
      selectedChips.forEach(chipName => {
        const newItemRef = doc(collection(db, 'workspaces', workspaceId, 'items'));
        batch.set(newItemRef, {
          name: chipName,
          quantity: 1,
          locationId: id,
          category: activeCat.name,
          tags: [chipName],
          createdAt: new Date().toISOString()
        });
      });
      await batch.commit();
      
      setSelectedChips(new Set());
      setShowGenerator(false);
      fetchLocationAndItems();
      
      alert(`✅ ${selectedChips.size} Items erfolgreich in "${location.name}" eingelagert!`);
    } catch (e) { 
      alert("Fehler beim Speichern der generierten Items."); 
    } finally { 
      setIsGenerating(false); 
    }
  };

  // 📍 MARKER-STUDIO LOGIK
  const openMarkerStudio = () => {
    setShowMarkerStudio(true);
    const firstUnmarked = itemsInLocation.find(i => i.tagX === null || i.tagX === undefined);
    setActiveMarkerItemId(firstUnmarked ? firstUnmarked.id : (itemsInLocation[0]?.id || null));
  };

  const handlePlaceMarker = async (e: React.MouseEvent<HTMLImageElement>) => {
    if (!activeMarkerItemId || !workspaceId) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    setItemsInLocation(prev => prev.map(item => 
      item.id === activeMarkerItemId ? { ...item, tagX: x, tagY: y } : item
    ));

    try {
      await updateDoc(doc(db, 'workspaces', workspaceId, 'items', activeMarkerItemId), {
        tagX: x,
        tagY: y
      });
    } catch (error) {
      console.error("Fehler beim Speichern des Markers:", error);
    }

    const currentIndex = itemsInLocation.findIndex(i => i.id === activeMarkerItemId);
    const nextUnmarked = itemsInLocation.slice(currentIndex + 1).find(i => i.tagX === null || i.tagX === undefined) 
                      || itemsInLocation.find(i => i.tagX === null || i.tagX === undefined); 

    if (nextUnmarked && nextUnmarked.id !== activeMarkerItemId) {
      setActiveMarkerItemId(nextUnmarked.id);
    }
  };

  // 🖨️ Lagerort-Etikett direkt aus dem Hub drucken (nativ, sonst Browser-Druck)
  const handlePrintLocationLabel = async () => {
    const handled = await tryPrintLocationsNative(
      [{ id: location.id, name: location.name, code: location.code }],
      ownerName,
      brotherPrinter,
      window.location.origin
    );
    if (handled) return;
    setPrintFallback(true);
    setTimeout(() => { window.print(); setTimeout(() => setPrintFallback(false), 500); }, 200);
  };

  // ➕➖ Menge direkt in der Inventar-Liste ändern (Bestandsprüfung vor Ort)
  const changeItemQuantity = async (itemId: string, delta: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!workspaceId) return;
    const item = itemsInLocation.find(i => i.id === itemId);
    if (!item) return;
    const newQty = Math.max(0, (Number(item.quantity) || 0) + delta);

    const update: any = { quantity: newQty };
    if (item.minQuantity != null && newQty <= Number(item.minQuantity) && !item.onShoppingList) {
      update.onShoppingList = true;
    }
    setItemsInLocation(prev => prev.map(i => i.id === itemId ? { ...i, ...update } : i));
    try {
      await updateDoc(doc(db, 'workspaces', workspaceId, 'items', itemId), update);
    } catch {
      alert('Fehler beim Speichern der Menge.');
    }
  };

  // 📸 FOTO-TAGGING LOGIK (Tippen zum Erfassen neuer Items)
  const allTags: string[] = Array.from(new Set(categories.flatMap((c: any) => c.tags || [])));

  const openPhotoTagging = () => {
    setShowPhotoTagging(true);
    setPendingTag(null);
    setNewItemName('');
  };

  const handlePhotoTaggingTap = (e: React.MouseEvent<HTMLImageElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setPendingTag({ x, y });
    setNewItemName('');
  };

  const createTaggedItem = async () => {
    if (!pendingTag || !workspaceId) return;
    setIsCreatingItem(true);
    try {
      const name = newItemName.trim() || 'Unbenannt';
      const docRef = await addDoc(collection(db, 'workspaces', workspaceId, 'items'), {
        name,
        quantity: 1,
        locationId: id,
        category: '', // -> landet im Eingangskorb zum späteren Einsortieren
        tags: [],
        tagX: pendingTag.x,
        tagY: pendingTag.y,
        createdAt: new Date().toISOString()
      });
      setItemsInLocation(prev => [...prev, {
        id: docRef.id, name, quantity: 1, locationId: id,
        category: '', tags: [], tagX: pendingTag.x, tagY: pendingTag.y
      }]);
      setPendingTag(null);
      setNewItemName('');
    } catch (e) {
      alert('Fehler beim Erfassen des Items.');
    } finally {
      setIsCreatingItem(false);
    }
  };

  const handleCaptureLocationPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !workspaceId) return;
    setIsUploadingPhoto(true);
    try {
      const fileRef = ref(storage, `workspaces/${workspaceId}/locations/${Date.now()}_${file.name}`);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);
      await updateDoc(doc(db, 'workspaces', workspaceId, 'locations', id), { imageUrl: url });
      setLocation((prev: any) => ({ ...prev, imageUrl: url }));
    } catch (err) {
      alert('Fehler beim Hochladen des Fotos.');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  if (!workspaceId || isLoading) return <div className="min-h-screen bg-slate-50 p-8 text-center text-slate-500">Lade Location Hub...</div>;
  if (!location) return null;

  return (
    <>
      <div className="min-h-screen bg-slate-50 p-4 md:p-8 pb-32 print:hidden">
        <div className="max-w-4xl mx-auto">
          
          <div className="flex justify-between items-center mb-6">
            <Link href="/locations" className="text-orange-600 hover:underline text-sm font-medium flex items-center gap-1">
              &larr; Zurück zur Übersicht
            </Link>
            <div className="flex gap-2">
              <button onClick={handlePrintLocationLabel} className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded-lg text-sm font-bold shadow-sm transition" title="QR-Etikett für diesen Ort drucken">
                🖨️ Etikett
              </button>
              <Link href={`/locations/${id}/edit`} className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded-lg text-sm font-bold shadow-sm transition">
                ✏️ Ort bearbeiten
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* LINKE SPALTE: Ort & Foto */}
            <div className="md:col-span-1 space-y-4">
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                {parentLocation && (
                  <Link href={`/locations/${parentLocation.id}`} className="inline-block text-[11px] font-bold text-slate-400 hover:text-orange-600 transition mb-1">
                    ↑ {parentLocation.name}
                  </Link>
                )}
                <h1 className="text-2xl font-black text-slate-900 mb-1">{location.name}</h1>
                {location.code && <span className="inline-block bg-slate-100 text-slate-500 text-xs font-mono px-2 py-1 rounded border border-slate-200 mb-4">{location.code}</span>}
                
                {location.imageUrl ? (
                  <div className="relative rounded-xl overflow-hidden border-2 border-slate-200 shadow-inner group">
                    <img src={location.imageUrl} alt={location.name} className="w-full h-auto" />
                    
                    <button 
                      onClick={openMarkerStudio}
                      disabled={itemsInLocation.length === 0}
                      className="absolute inset-0 bg-slate-900/40 hover:bg-slate-900/60 transition flex items-center justify-center opacity-0 group-hover:opacity-100 disabled:opacity-0"
                    >
                      <span className="bg-orange-600 text-white font-bold px-4 py-3 rounded-xl text-sm shadow-lg transform hover:scale-105 transition flex items-center gap-2">
                        📍 Marker-Studio öffnen
                      </span>
                    </button>

                    {itemsInLocation.map(item => {
                      if (item.tagX === null || item.tagX === undefined) return null;
                      return (
                        <div 
                          key={`preview-${item.id}`}
                          className="absolute w-2 h-2 bg-green-500 rounded-full border border-white shadow-sm transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                          style={{ left: `${item.tagX}%`, top: `${item.tagY}%` }}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <div className="bg-slate-100 h-40 rounded-xl flex items-center justify-center border-2 border-slate-200 border-dashed">
                    <span className="text-slate-400 text-sm font-medium">Kein Foto vorhanden</span>
                  </div>
                )}
                {location.imageUrl && itemsInLocation.length === 0 && (
                  <p className="text-[10px] text-slate-400 mt-2 text-center">Füge Items hinzu, um Marker zu setzen.</p>
                )}

                <button
                  onClick={openPhotoTagging}
                  className="mt-4 w-full bg-orange-600 text-white font-bold py-3 rounded-xl shadow-md hover:bg-orange-700 transition flex items-center justify-center gap-2"
                >
                  📸 Foto-Tagging
                </button>
                <p className="text-[10px] text-slate-400 mt-1.5 text-center">Foto aufnehmen & durch Tippen neue Items erfassen.</p>
              </div>
            </div>

            {/* RECHTE SPALTE: Inventar & Generator */}
            <div className="md:col-span-2 space-y-6">
              
              {/* DER SET-GENERATOR */}
              <div className="bg-orange-50 p-5 rounded-2xl shadow-sm border border-orange-200">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h2 className="text-lg font-bold text-orange-900 flex items-center gap-2">✨ Schnell-Erfassung</h2>
                    <p className="text-xs text-orange-700 mb-4">Wähle eine Kategorie und tippe an, was du gerade vor dir siehst.</p>
                  </div>
                  <button onClick={() => setShowGenerator(!showGenerator)} className="bg-white text-orange-600 hover:bg-orange-100 border border-orange-200 px-3 py-1.5 rounded-lg text-sm font-bold shadow-sm transition">
                    {showGenerator ? 'Schließen' : 'Öffnen'}
                  </button>
                </div>

                {showGenerator && (
                  <div className="bg-white p-4 rounded-xl border border-orange-100 animate-fade-in">
                    <select 
                      value={selectedCategoryId} 
                      onChange={(e) => { setSelectedCategoryId(e.target.value); setSelectedChips(new Set()); }}
                      className="w-full p-2.5 mb-4 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-800 outline-none focus:border-orange-500"
                    >
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
                      ))}
                    </select>

                    <div className="flex flex-wrap gap-2 mb-6">
                      {categories.find(c => c.id === selectedCategoryId)?.tags?.map((chip: string) => {
                        const isSelected = selectedChips.has(chip);
                        return (
                          <button
                            key={chip}
                            onClick={() => toggleChip(chip)}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${
                              isSelected 
                                ? 'bg-orange-500 text-white border-orange-600 shadow-md scale-105' 
                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                            }`}
                          >
                            {isSelected ? '✓ ' : '+ '}{chip}
                          </button>
                        );
                      })}
                      {(!categories.find(c => c.id === selectedCategoryId)?.tags || categories.find(c => c.id === selectedCategoryId)?.tags.length === 0) && (
                         <p className="text-xs text-slate-400 italic">Keine Tags in dieser Kategorie hinterlegt.</p>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button 
                        onClick={handleGenerateItems} 
                        disabled={selectedChips.size === 0 || isGenerating}
                        className="flex-1 bg-slate-900 text-white font-bold py-3 rounded-xl shadow-md transition disabled:opacity-50 hover:bg-slate-800"
                      >
                        {isGenerating ? 'Generiere...' : `${selectedChips.size} Items einlagern`}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* LISTE DER ITEMS AN DIESEM ORT */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center">
                  <h3 className="font-bold text-slate-800">📦 Inventar an diesem Ort ({itemsInLocation.length})</h3>
                </div>
                
                {itemsInLocation.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 italic text-sm">Dieser Ort ist noch leer.</div>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {itemsInLocation.map(item => (
                      <li key={item.id}>
                        <Link href={`/item/${item.id}`} className="flex items-center justify-between p-4 hover:bg-orange-50 transition group">
                          <div className="flex items-center gap-3">
                            <div className={`w-2 h-2 rounded-full ${item.tagX !== null ? 'bg-green-500' : 'bg-slate-300'}`} title={item.tagX !== null ? "Marker gesetzt" : "Kein Marker"} />
                            <div>
                              <p className="font-bold text-slate-800 group-hover:text-orange-700 transition">{item.name}</p>
                              {item.category && <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">{item.category}</p>}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => changeItemQuantity(item.id, -1, e)}
                              className="w-7 h-7 flex items-center justify-center bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-md text-slate-600 font-bold transition"
                              title="Menge verringern"
                            >−</button>
                            <span className="bg-slate-100 text-slate-600 text-xs font-bold px-2.5 py-1 rounded-lg border border-slate-200 min-w-[38px] text-center">
                              {item.quantity}x
                            </span>
                            <button
                              onClick={(e) => changeItemQuantity(item.id, 1, e)}
                              className="w-7 h-7 flex items-center justify-center bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-md text-slate-600 font-bold transition"
                              title="Menge erhöhen"
                            >+</button>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* 📍 DAS FULLSCREEN MARKER-STUDIO (MOBILE OPTIMIERT) */}
      {showMarkerStudio && (
        <div className="fixed inset-0 z-50 bg-slate-900 flex flex-col md:flex-row animate-fade-in h-[100dvh] overflow-hidden">
          
          {/* Main Area: The Image (Schrumpft dynamisch) */}
          <div className="flex-1 relative bg-slate-950 flex flex-col min-h-0">
            <div className="p-3 md:p-4 flex justify-between items-center bg-slate-900 shadow-md z-10 flex-shrink-0">
              <div>
                <h2 className="text-white font-bold text-base md:text-lg flex items-center gap-2">📍 Marker-Studio</h2>
                <p className="text-slate-400 text-xs">{location.name}</p>
              </div>
              <button 
                onClick={() => setShowMarkerStudio(false)}
                className="bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 md:px-4 md:py-2 rounded-lg text-sm font-bold transition"
              >
                Fertig
              </button>
            </div>

            <div className="flex-1 p-2 md:p-8 flex items-center justify-center min-h-0 relative">
              {/* Dieser Container umarmt das Bild exakt, damit die Prozente stimmen */}
              <div className="relative inline-block" style={{ maxWidth: '100%', maxHeight: '100%' }}>
                <img 
                  src={location.imageUrl} 
                  alt="Lagerort" 
                  className="block max-w-full max-h-full cursor-crosshair border-2 border-slate-800 rounded-lg shadow-2xl" 
                  onClick={handlePlaceMarker}
                  draggable={false}
                />
                
                {/* Alle Marker auf dem Bild rendern */}
                {itemsInLocation.map(item => {
                  if (item.tagX === null || item.tagX === undefined) return null;
                  const isActive = item.id === activeMarkerItemId;
                  
                  return (
                    <div 
                      key={`marker-${item.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMarkerItemId(item.id);
                      }}
                      className={`absolute rounded-full border-2 border-white shadow-lg cursor-pointer transform -translate-x-1/2 -translate-y-1/2 transition-all ${
                        isActive 
                          ? 'bg-orange-500 w-6 h-6 z-20 animate-pulse ring-4 ring-orange-500/30' 
                          : 'bg-green-500 w-4 h-4 z-10 opacity-70 hover:opacity-100 hover:scale-125'
                      }`}
                      style={{ left: `${item.tagX}%`, top: `${item.tagY}%` }}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          {/* Sidebar: Item List (Feste Höhe auf Mobile, volle Höhe auf Desktop) */}
          <div className="w-full h-[35vh] md:h-full md:w-80 bg-white flex flex-col flex-shrink-0 shadow-[0_-10px_30px_rgba(0,0,0,0.5)] md:shadow-[-10px_0_30px_rgba(0,0,0,0.5)] z-20">
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex-shrink-0">
              <h3 className="font-bold text-slate-800 text-sm">Zu platzieren</h3>
              <p className="text-[10px] text-slate-500 mt-0.5">Wähle ein Item und tippe auf das Bild.</p>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2">
              <ul className="space-y-1">
                {itemsInLocation.map(item => {
                  const isActive = item.id === activeMarkerItemId;
                  const hasMarker = item.tagX !== null && item.tagX !== undefined;
                  
                  return (
                    <li key={`list-${item.id}`}>
                      <button
                        onClick={() => setActiveMarkerItemId(item.id)}
                        className={`w-full text-left p-3 rounded-lg flex items-center justify-between transition-all ${
                          isActive 
                            ? 'bg-orange-100 border border-orange-300 shadow-sm' 
                            : 'hover:bg-slate-50 border border-transparent'
                        }`}
                      >
                        <div>
                          <p className={`text-sm font-bold ${isActive ? 'text-orange-900' : 'text-slate-700'}`}>
                            {item.name}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {hasMarker ? '✅ Platziert' : '⏳ Wartet auf Marker'}
                          </p>
                        </div>
                        <div className={`w-3 h-3 rounded-full border flex-shrink-0 ${
                          hasMarker 
                            ? (isActive ? 'bg-orange-500 border-orange-600' : 'bg-green-500 border-green-600') 
                            : 'bg-slate-200 border-slate-300'
                        }`} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
          
        </div>
      )}

      {/* 🖨️ Browser-Fallback für das Lagerort-Etikett */}
      {printFallback && (
        <div className="hidden print:flex fixed inset-0 bg-white items-center justify-center">
          <div className="text-center flex flex-col items-center justify-center" style={{ width: '62mm', height: '29mm' }}>
            <QRCode value={buildLocationLabelUrl(window.location.origin, location.id)} size={64} level="M" />
            <p className="mt-1 text-sm font-bold uppercase tracking-widest text-black leading-none whitespace-nowrap overflow-hidden text-ellipsis w-full px-1">{location.name}</p>
            {location.code && <p className="text-[10px] font-mono text-black mt-0.5 leading-none">{location.code}</p>}
          </div>
        </div>
      )}

      {/* 📸 FOTO-TAGGING: Foto aufnehmen & durch Tippen Items erfassen */}
      {showPhotoTagging && (
        <div className="fixed inset-0 z-50 bg-slate-900 flex flex-col h-[100dvh] overflow-hidden animate-fade-in">

          {/* Header */}
          <div className="p-3 md:p-4 flex justify-between items-center bg-slate-900 shadow-md z-10 flex-shrink-0">
            <div>
              <h2 className="text-white font-bold text-base md:text-lg flex items-center gap-2">📸 Foto-Tagging</h2>
              <p className="text-slate-400 text-xs">{location.name} · {itemsInLocation.length} Items</p>
            </div>
            <button
              onClick={() => { setShowPhotoTagging(false); setPendingTag(null); fetchLocationAndItems(); }}
              className="bg-orange-600 hover:bg-orange-500 text-white px-4 py-2 rounded-lg text-sm font-bold transition"
            >
              Fertig
            </button>
          </div>

          {!location.imageUrl ? (
            /* Noch kein Foto -> zuerst aufnehmen */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <p className="text-slate-300 mb-6 font-medium max-w-xs">Mach zuerst ein Foto von diesem Ort – danach tippst Du die Items direkt aufs Bild.</p>
              <label className="bg-orange-600 hover:bg-orange-500 text-white font-bold px-6 py-4 rounded-xl cursor-pointer shadow-lg transition">
                {isUploadingPhoto ? 'Lädt…' : '📷 Foto aufnehmen'}
                <input type="file" accept="image/*" capture="environment" onChange={handleCaptureLocationPhoto} className="hidden" disabled={isUploadingPhoto} />
              </label>
            </div>
          ) : (
            <>
              {/* Bild-Bereich (Tippen platziert einen neuen Marker) */}
              <div className="flex-1 p-2 md:p-6 flex items-center justify-center min-h-0 relative">
                <div className="relative inline-block" style={{ maxWidth: '100%', maxHeight: '100%' }}>
                  <img
                    src={location.imageUrl}
                    alt="Ort"
                    onClick={handlePhotoTaggingTap}
                    draggable={false}
                    className="block max-w-full max-h-full cursor-crosshair border-2 border-slate-800 rounded-lg shadow-2xl"
                  />

                  {itemsInLocation.map(item => {
                    if (item.tagX === null || item.tagX === undefined) return null;
                    return (
                      <div
                        key={`pt-${item.id}`}
                        className="absolute w-4 h-4 bg-green-500 rounded-full border-2 border-white shadow transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                        style={{ left: `${item.tagX}%`, top: `${item.tagY}%` }}
                      />
                    );
                  })}

                  {pendingTag && (
                    <div
                      className="absolute w-6 h-6 bg-orange-500 rounded-full border-2 border-white shadow-lg transform -translate-x-1/2 -translate-y-1/2 pointer-events-none animate-pulse ring-4 ring-orange-500/30"
                      style={{ left: `${pendingTag.x}%`, top: `${pendingTag.y}%` }}
                    />
                  )}
                </div>
              </div>

              {/* Bottom Sheet: Schnell-Eingabe */}
              <div className="bg-white flex-shrink-0 p-4 pb-8 shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
                {pendingTag ? (
                  <div className="space-y-3 animate-fade-in">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Neues Item an dieser Stelle</label>
                    <input
                      type="text"
                      list="phototag-suggestions"
                      value={newItemName}
                      onChange={(e) => setNewItemName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); createTaggedItem(); } }}
                      placeholder="Bezeichnung (z.B. Akkuschrauber)"
                      autoFocus
                      className="w-full p-3 border border-slate-300 rounded-xl bg-white text-slate-900 outline-none font-bold text-lg focus:border-orange-500"
                    />
                    <datalist id="phototag-suggestions">
                      {allTags.map(t => <option key={t} value={t} />)}
                    </datalist>
                    <div className="flex gap-2">
                      <button onClick={createTaggedItem} disabled={isCreatingItem} className="flex-1 bg-slate-900 text-white font-bold py-3 rounded-xl hover:bg-slate-800 transition disabled:opacity-50">
                        {isCreatingItem ? 'Speichert…' : '✓ Erfassen'}
                      </button>
                      <button onClick={() => { setPendingTag(null); setNewItemName(''); }} className="px-5 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition">
                        Abbrechen
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-400 text-center">Landet im Eingangskorb – später einsortieren.</p>
                  </div>
                ) : (
                  <div className="text-center">
                    <p className="text-sm font-bold text-slate-700">Tippe auf das Foto, um ein Item zu erfassen.</p>
                    <p className="text-[11px] text-slate-400 mt-1">Grüne Punkte = bereits erfasst. Neues Foto? Über „Ort bearbeiten".</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}