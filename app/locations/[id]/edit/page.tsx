"use client";

import { useState, useEffect, use } from 'react';
import { db, storage } from '../../../../lib/firebase';
import { doc, getDoc, getDocs, collection, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useRouter } from 'next/navigation';
import { useWorkspace } from '../../../../context/WorkspaceContext';

export default function EditLocation({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { workspaceId } = useWorkspace();
  const resolvedParams = use(params);
  const id = resolvedParams.id;

  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [code, setCode] = useState('');
  const [existingImageUrl, setExistingImageUrl] = useState('');

  const [existingLocations, setExistingLocations] = useState<any[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!workspaceId) return;

    const fetchData = async () => {
      try {
        // 1. Lade diesen spezifischen Ort
        const locRef = doc(db, 'workspaces', workspaceId, 'locations', id);
        const locSnap = await getDoc(locRef);

        if (locSnap.exists()) {
          const data = locSnap.data();
          setName(data.name || '');
          setParentId(data.parentId || '');
          setCode(data.code || '');
          setExistingImageUrl(data.imageUrl || '');
        } else {
          alert("Lagerort nicht gefunden!");
          router.push('/locations');
        }

        // 2. Lade alle anderen Orte für das Dropdown
        const querySnapshot = await getDocs(collection(db, 'workspaces', workspaceId, 'locations'));
        const locs: any[] = [];
        querySnapshot.forEach((docSnap) => {
          if (docSnap.id !== id) {
            locs.push({ id: docSnap.id, ...docSnap.data() });
          }
        });
        setExistingLocations(locs);

      } catch (error) {
        console.error("Fehler beim Laden:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [id, workspaceId, router]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!workspaceId) return;

    setIsSaving(true);

    try {
      let finalImageUrl = existingImageUrl;

      if (imageFile) {
        const imageRef = ref(storage, `workspaces/${workspaceId}/locations/${Date.now()}_${imageFile.name}`);
        await uploadBytes(imageRef, imageFile);
        finalImageUrl = await getDownloadURL(imageRef);
      }

      const locRef = doc(db, 'workspaces', workspaceId, 'locations', id);
      await updateDoc(locRef, {
        name,
        parentId: parentId || null,
        code,
        imageUrl: finalImageUrl
      });

      router.push('/locations');

    } catch (error) {
      console.error("Fehler: ", error);
      alert('Fehler beim Speichern des Ortes.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!workspaceId || isLoading) return <div className="min-h-screen bg-slate-50 p-8 text-center text-slate-500">Lade Lagerort...</div>;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-xl mx-auto bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-slate-800">Lagerort bearbeiten</h1>
          <button onClick={() => router.push('/locations')} className="w-10 h-10 flex items-center justify-center bg-slate-100 text-slate-500 rounded-full hover:bg-slate-200 transition text-lg">
            ✖️
          </button>
        </div>
        
        <form onSubmit={handleSave} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Name des Ortes</label>
              <input 
                type="text" 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                className="w-full p-3 bg-white border border-slate-300 rounded-xl text-slate-900 font-bold outline-none focus:border-orange-500 transition" 
                required 
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Label-Code (QR)</label>
              <input 
                type="text" 
                value={code} 
                onChange={(e) => setCode(e.target.value)} 
                className="w-full p-3 bg-white border border-slate-300 rounded-xl text-slate-900 font-mono text-sm outline-none focus:border-orange-500 transition" 
              />
            </div>
          </div>

          <div>
             <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Befindet sich dieser Ort IN einem anderen?</label>
             <select 
                value={parentId} 
                onChange={(e) => setParentId(e.target.value)}
                className="w-full p-3 bg-white border border-slate-300 rounded-xl text-slate-900 font-medium outline-none focus:border-orange-500 transition"
              >
                <option value="">-- Nein, das ist ein Haupt-Ort --</option>
                {/* NEU: Die Baumstruktur-Logik direkt im Dropdown */}
                {(() => {
                  const buildTree = (currentParentId: string | null, depth: number): any[] => {
                    let result: any[] = [];
                    const children = existingLocations.filter(l => (l.parentId || null) === currentParentId);
                    children.forEach(child => {
                      result.push({ ...child, depth });
                      result = result.concat(buildTree(child.id, depth + 1));
                    });
                    return result;
                  };
                  return buildTree(null, 0).map(loc => (
                    <option key={loc.id} value={loc.id}>
                      {'\u00A0\u00A0\u00A0'.repeat(loc.depth)}{loc.depth > 0 ? '↳ ' : ''}{loc.name}
                    </option>
                  ));
                })()}
             </select>
          </div>

          <div className="border-t border-slate-100 pt-6 mt-2">
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Neues Foto aufnehmen (Optional)</label>
            <input 
              type="file" 
              accept="image/*" 
              capture="environment" 
              onChange={handleImageChange}
              className="block w-full text-sm text-slate-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100 cursor-pointer"
            />
          </div>

          {(previewUrl || existingImageUrl) && (
            <div className="mt-4 border-2 border-slate-200 rounded-xl overflow-hidden shadow-sm relative">
              <span className="absolute top-2 left-2 bg-slate-900/70 text-white text-[10px] font-bold px-2 py-1 rounded backdrop-blur-sm">
                {previewUrl ? 'Neues Foto' : 'Aktuelles Foto'}
              </span>
              <img src={previewUrl || existingImageUrl} alt="Vorschau" className="w-full h-auto" />
            </div>
          )}

          <button type="submit" disabled={isSaving} className="w-full bg-orange-600 text-white font-bold py-4 rounded-xl hover:bg-orange-700 disabled:opacity-50 mt-8 shadow-md transition text-lg">
            {isSaving ? 'Speichert...' : 'Änderungen speichern'}
          </button>
        </form>
      </div>
    </div>
  );
}