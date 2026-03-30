// app/new/page.js
"use client";

import { useState } from 'react';
import { db, storage } from '../../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

export default function NewItem() {
  const [name, setName] = useState('');
  const [tags, setTags] = useState([]);
  const [quantity, setQuantity] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  
  // Neue States für das Foto-Feature
  const [imageFile, setImageFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [tagCoords, setTagCoords] = useState(null);

  const generateSmartTags = () => {
    const lowerName = name.toLowerCase();
    let newTags = [];
    if (lowerName.includes('bohr') || lowerName.includes('flex')) newTags.push('Werkzeug', 'Maschine');
    if (lowerName.includes('schraube') || lowerName.includes('nagel')) newTags.push('Verbrauchsmaterial');
    if (lowerName.includes('holz')) newTags.push('Holzbearbeitung');
    if (newTags.length === 0) newTags.push('Allgemein');
    setTags(newTags);
  };

  // Wenn ein Foto ausgewählt/gemacht wird
  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      setPreviewUrl(URL.createObjectURL(file)); // Erzeugt eine lokale Vorschau
      setTagCoords(null); // Reset der Koordinaten beim neuen Bild
    }
  };

  // Wenn du auf das Foto klickst, um den roten Punkt zu setzen
  const handleImageClick = (e) => {
    const rect = e.target.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setTagCoords({ x, y });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      let finalImageUrl = "";

      // 1. Wenn ein Bild da ist, laden wir es ZUERST hoch
      if (imageFile) {
        const imageRef = ref(storage, `locations/${Date.now()}_${imageFile.name}`);
        const snapshot = await uploadBytes(imageRef, imageFile);
        finalImageUrl = await getDownloadURL(snapshot.ref); // Holt den echten Web-Link zum Bild
      }

      // 2. Danach speichern wir das Item mit dem Bild-Link und den Koordinaten
      await addDoc(collection(db, 'items'), {
        name,
        tags,
        quantity,
        status: 'AVAILABLE',
        imageUrl: finalImageUrl,
        tagX: tagCoords ? tagCoords.x : null,
        tagY: tagCoords ? tagCoords.y : null,
        qrCodeId: '', 
        createdAt: serverTimestamp()
      });
      
      alert('Erfolgreich mit Foto gespeichert!');
      // Formular leeren
      setName(''); setTags([]); setQuantity(1); setImageFile(null); setPreviewUrl(null); setTagCoords(null);
    } catch (error) {
      console.error("Fehler: ", error);
      alert('Fehler beim Speichern. Siehe Console.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-xl mx-auto bg-white p-6 rounded-xl shadow-sm border border-slate-100">
        <h1 className="text-2xl font-bold mb-6 text-slate-800">Neues Item erfassen</h1>
        
        <form onSubmit={handleSave} className="space-y-6">
          {/* Name & Tags (wie vorher) */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Was möchtest du erfassen?</label>
            <div className="flex gap-2">
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none" required />
              <button type="button" onClick={generateSmartTags} className="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm">✨ Tags</button>
            </div>
          </div>

          {/* FOTO UPLOAD BEREICH */}
          <div className="border-t pt-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">Lagerort (Foto vom Schrank/Regal)</label>
            <input 
              type="file" 
              accept="image/*" 
              capture="environment" // Sagt dem Handy: Nutze primär die Kamera!
              onChange={handleImageChange}
              className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100"
            />
            <p className="text-xs text-slate-500 mt-2">Mache ein Foto und klicke dann darauf, um den genauen Ort zu markieren.</p>
          </div>

          {/* FOTO VORSCHAU & KLICK-LOGIK */}
          {previewUrl && (
            <div className="relative inline-block mt-4 border-2 border-slate-200 rounded-lg overflow-hidden">
              <img 
                src={previewUrl} 
                alt="Vorschau" 
                onClick={handleImageClick}
                className="max-w-full h-auto cursor-crosshair"
              />
              {/* Der rote Punkt, der beim Klicken erscheint */}
              {tagCoords && (
                <div 
                  className="absolute w-6 h-6 bg-red-600 border-2 border-white rounded-full shadow-lg pointer-events-none"
                  style={{ 
                    left: `${tagCoords.x}%`, 
                    top: `${tagCoords.y}%`, 
                    transform: 'translate(-50%, -50%)' 
                  }}
                />
              )}
            </div>
          )}

          <button type="submit" disabled={isSaving} className="w-full bg-orange-600 text-white font-bold py-3 rounded-lg hover:bg-orange-700 disabled:opacity-50 mt-8">
            {isSaving ? 'Speichert & Lädt Foto hoch...' : 'Item mit Foto speichern'}
          </button>
        </form>
      </div>
    </div>
  );
}