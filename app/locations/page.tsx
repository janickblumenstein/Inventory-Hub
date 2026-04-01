"use client";

import { useState, useEffect } from 'react';
import { db, storage } from '../../lib/firebase';
import { collection, addDoc, getDocs, doc, deleteDoc, query, orderBy, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import Link from 'next/link';
import QRCode from 'react-qr-code'; 
import { useWorkspace } from '../../context/WorkspaceContext';

export default function LocationsManager() {
  const { workspaceId } = useWorkspace();
  const [printLoc, setPrintLoc] = useState<any>(null); 
  const [locations, setLocations] = useState<any[]>([]);
  const [newName, setNewName] = useState('');
  const [parentLocId, setParentLocId] = useState('');
  
  const [locCode, setLocCode] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);

  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const fetchLocations = async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const q = query(collection(db, 'workspaces', workspaceId, 'locations'), orderBy('name', 'asc'));
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setLocations(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (workspaceId) {
      fetchLocations();
    }
  }, [workspaceId]); // Abhängigkeit hinzugefügt!

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

  const generateRandomCode = () => {
    return 'LOC-' + Math.random().toString(36).substring(2, 6).toUpperCase();
  };

  const handleAddLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !workspaceId) return;
    
    setIsSaving(true);
    try {
      let imageUrl = "";
      if (imageFile) {
        // FIX: Bild-Pfad in den Workspace-Ordner umgebogen!
        const fileRef = ref(storage, `workspaces/${workspaceId}/locations/${Date.now()}_${imageFile.name}`);
        await uploadBytes(fileRef, imageFile);
        imageUrl = await getDownloadURL(fileRef);
      }

      const finalCode = locCode.trim() || generateRandomCode();

      await addDoc(collection(db, 'workspaces', workspaceId, 'locations'), {
        name: newName.trim(),
        parentId: parentLocId || null,
        code: finalCode, 
        imageUrl: imageUrl, 
        createdAt: new Date().toISOString()
      });
      
      setNewName('');
      setParentLocId('');
      setLocCode('');
      setImageFile(null);
      fetchLocations();
    } catch (e) {
      alert("Fehler beim Speichern");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!workspaceId) return;
    if (confirm("Lagerort wirklich löschen?")) {
      // FIX: Lösch-Pfad in den Workspace-Ordner umgebogen!
      await deleteDoc(doc(db, 'workspaces', workspaceId, 'locations', id));
      fetchLocations();
    }
  };

  const handlePrint = (loc: any) => {
    setPrintLoc(loc);
    setTimeout(() => { window.print(); }, 200); 
  };

  // Verhindert das Rendern, bevor wir wissen, in welcher Werkstatt wir sind
  if (!workspaceId || loading) return <div className="min-h-screen bg-slate-50 p-8 text-center text-slate-500 font-medium">Lade Struktur...</div>;

  const hierarchicalLocs = getHierarchicalLocations();

  return (
    <>
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 print:hidden">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold text-slate-800">Lagerorte</h1>
          <Link href="/" className="text-orange-600 font-medium hover:underline">← Dashboard</Link>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-8">
          <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Ort hinzufügen</h2>
          <form onSubmit={handleAddLocation} className="space-y-4">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Name (z.B. Gestell 1)</label>
                <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full p-3 bg-white border border-slate-300 rounded-xl text-slate-900 font-bold outline-none focus:border-orange-500" required />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Label-Code (Optional)</label>
                <input type="text" value={locCode} onChange={(e) => setLocCode(e.target.value)} placeholder="Wird auto-generiert..." className="w-full p-3 bg-white border border-slate-300 rounded-xl text-slate-900 outline-none font-mono text-sm focus:border-orange-500" />
              </div>
            </div>
            
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Steht innerhalb von...</label>
              <select value={parentLocId} onChange={(e) => setParentLocId(e.target.value)} className="w-full p-3 bg-white border border-slate-300 rounded-xl text-slate-900 font-bold outline-none focus:border-orange-500">
                <option value="">-- Haupt-Lagerort (Kein Eltern-Ort) --</option>
                {hierarchicalLocs.map(loc => (
                  <option key={loc.id} value={loc.id}>
                    {'\u00A0\u00A0\u00A0'.repeat(loc.depth)}{loc.depth > 0 ? '↳ ' : ''}{loc.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="pt-2">
              <label className="block text-xs font-semibold text-slate-500 mb-1">Foto vom Ort (Optional)</label>
              <input type="file" accept="image/*" capture="environment" onChange={(e) => e.target.files && setImageFile(e.target.files[0])} className="text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-orange-50 file:text-orange-700 file:font-bold hover:file:bg-orange-100 cursor-pointer" />
            </div>

            <button type="submit" disabled={isSaving} className="w-full bg-slate-800 text-white font-bold py-3 rounded-xl hover:bg-slate-900 transition mt-2 shadow-sm disabled:opacity-50">
              {isSaving ? 'Speichere...' : '+ Ort anlegen'}
            </button>
          </form>
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider px-1">Deine Logistik-Struktur</h2>
          {hierarchicalLocs.length === 0 && (
             <p className="text-slate-400 text-sm italic px-1">Noch keine Lagerorte angelegt.</p>
          )}
          {hierarchicalLocs.map(loc => (
            <div key={loc.id} className="flex items-center bg-white p-3 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden" style={{ marginLeft: `${loc.depth * 20}px` }}>
              
              {loc.depth === 0 && <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-slate-800"></div>}
              {loc.depth > 0 && <div className="text-slate-300 mr-2 ml-1 font-bold">↳</div>}

              <div className="w-12 h-12 rounded-lg bg-slate-100 flex-shrink-0 border border-slate-200 overflow-hidden mr-3 flex items-center justify-center text-slate-400 text-xs">
                {loc.imageUrl ? <img src={loc.imageUrl} alt={loc.name} className="w-full h-full object-cover" /> : 'Kein Bild'}
              </div>

              <div className="flex-1 min-w-0">
                <p className={`font-bold text-slate-800 truncate ${loc.depth === 0 ? 'text-lg' : 'text-md'}`}>{loc.name}</p>
                <div className="flex gap-2 items-center mt-0.5">
                  <span className="bg-slate-100 text-slate-500 text-[10px] font-mono px-2 py-0.5 rounded border border-slate-200">
                    {loc.code || 'NO-CODE'}
                  </span>
                </div>
              </div>

              <div className="flex gap-1">
                {/* NEU: Der Bearbeiten-Button */}
                <Link href={`/locations/${loc.id}`} className="text-slate-400 hover:text-orange-600 p-2 transition text-lg" title="Bearbeiten">✏️</Link>
                <button onClick={() => handlePrint(loc)} className="text-slate-400 hover:text-slate-800 p-2 transition text-lg" title="Etikett drucken">🖨️</button>
                <button onClick={() => handleDelete(loc.id)} className="text-slate-300 hover:text-red-500 p-2 transition text-lg" title="Löschen">🗑️</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>

    <div className="hidden print:flex fixed inset-0 bg-white items-center justify-center">
      {printLoc && (
        <div className="text-center flex flex-col items-center justify-center" style={{ width: '62mm', height: '29mm' }}>
          <QRCode value={printLoc.code} size={64} level="M" />
          <p className="mt-1 text-sm font-bold uppercase tracking-widest text-black leading-none whitespace-nowrap overflow-hidden text-ellipsis w-full px-1">{printLoc.name}</p>
          <p className="text-[10px] font-mono text-black mt-0.5 leading-none">{printLoc.code}</p>
        </div>
      )}
    </div>
    </>
  );
}