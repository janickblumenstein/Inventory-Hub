"use client";

import { useState, useMemo } from 'react';
import { WORKSHOP_TAXONOMY } from '../lib/taxonomy';

interface TagSelectorProps {
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
}

export default function TagSelector({ selectedTags, onTagsChange }: TagSelectorProps) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const categories = Object.keys(WORKSHOP_TAXONOMY);

  // Alle Tags für die Suchfunktion in eine flache Liste packen
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    Object.values(WORKSHOP_TAXONOMY).forEach(list => list.forEach(t => tags.add(t)));
    return Array.from(tags);
  }, []);

  // Filter-Logik: Entweder Suchergebnisse ODER die aktive Kategorie anzeigen
  const displayedTags = useMemo(() => {
    if (searchTerm) {
      const lowerTerm = searchTerm.toLowerCase();
      return allTags.filter(t => t.toLowerCase().includes(lowerTerm));
    }
    if (activeCategory) {
      return WORKSHOP_TAXONOMY[activeCategory];
    }
    return [];
  }, [searchTerm, activeCategory, allTags]);

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      onTagsChange(selectedTags.filter(t => t !== tag)); // Entfernen
    } else {
      onTagsChange([...selectedTags, tag]); // Hinzufügen
    }
  };

  const handleAddCustom = (e: React.MouseEvent) => {
    e.preventDefault();
    if (searchTerm && !selectedTags.includes(searchTerm)) {
      onTagsChange([...selectedTags, searchTerm.trim()]);
      setSearchTerm(""); // Suche nach dem Hinzufügen leeren
    }
  };

  const exactMatchFound = displayedTags.some(t => t.toLowerCase() === searchTerm.toLowerCase());

  return (
    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
      
      {/* 1. Die Suchleiste */}
      <div>
        <input 
          type="text" 
          placeholder="🔍 Werkzeug oder Eigenschaft suchen..." 
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setActiveCategory(null); // Kategorie-Ansicht schließen, wenn gesucht wird
          }}
          className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-sm outline-none focus:ring-2 focus:ring-orange-500"
        />
      </div>

      {/* 2. Die Hauptkategorien (Chips) - Nur anzeigen, wenn nicht gesucht wird */}
      {!searchTerm && (
        <div className="flex overflow-x-auto gap-2 pb-2 scrollbar-hide">
          {categories.map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
              className={`whitespace-nowrap px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                activeCategory === cat 
                  ? 'bg-slate-800 text-white border-slate-800' 
                  : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* 3. Die Vorschläge (Sub-Tags) */}
      {(displayedTags.length > 0 || (searchTerm && !exactMatchFound)) && (
        <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 min-h-[60px]">
          <div className="flex flex-wrap gap-2">
            {displayedTags.map(tag => {
              const isSelected = selectedTags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`px-3 py-1 rounded-md text-sm transition-colors ${
                    isSelected 
                      ? 'bg-orange-100 text-orange-800 border border-orange-300 font-bold' 
                      : 'bg-white text-slate-700 border border-slate-200 hover:border-orange-300'
                  }`}
                >
                  {isSelected ? '✓ ' : '+ '} {tag}
                </button>
              );
            })}
            
            {/* Button für komplett neue Wörter (Die Lern-Funktion) */}
            {searchTerm && !exactMatchFound && (
              <button
                type="button"
                onClick={handleAddCustom}
                className="px-3 py-1 rounded-md text-sm bg-orange-600 text-white font-medium hover:bg-orange-700 shadow-sm"
              >
                ✨ "{searchTerm}" als neuen Tag anlegen
              </button>
            )}
          </div>
        </div>
      )}

      {/* 4. Aktuell ausgewählte Tags anzeigen (Damit man sieht, was das Item alles ist) */}
      {selectedTags.length > 0 && (
        <div className="pt-2 border-t border-slate-100">
          <p className="text-xs text-slate-500 mb-2 uppercase font-semibold">Ausgewählte Tags:</p>
          <div className="flex flex-wrap gap-2">
            {selectedTags.map(tag => (
              <span key={tag} className="flex items-center gap-1 bg-slate-800 text-white px-2 py-1 rounded-md text-xs">
                {tag}
                <button type="button" onClick={() => toggleTag(tag)} className="text-slate-400 hover:text-white ml-1">×</button>
              </span>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}