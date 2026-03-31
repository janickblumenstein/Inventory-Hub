// lib/taxonomy.ts

export const WORKSHOP_TAXONOMY: Record<string, string[]> = {
  "🪚 Sägen & Trennen": [
    "Kappsäge", "Stichsäge", "Handkreissäge", "Tischkreissäge", 
    "Winkelschleifer (Flex)", "Handsäge", "Japan-Säge", "Multitool", 
    "Sägeblatt", "Trennscheibe"
  ],
  "🔨 Handwerkzeug": [
    "Hammer", "Schraubendreher", "Zange", "Stechbeitel", 
    "Hobel", "Feile", "Wasserwaage", "Maßband", 
    "Schraubenschlüssel", "Inbus", "Schraubzwinge"
  ],
  "🔌 Maschinen (Bohren/Schleifen)": [
    "Akkuschrauber", "Bohrmaschine", "Bohrhammer", "Oberfräse", 
    "Exzenterschleifer", "Schwingschleifer", "Kompressor", "Staubsauger"
  ],
  "🔩 Befestigung": [
    "Holzschraube", "Metallschraube", "Dübel", "Nagel", 
    "Mutter", "Unterlegscheibe", "Gewindestange", "Winkel", "Scharnier"
  ],
  "🧪 Chemie & Verbrauch": [
    "Schmierspray", "PTFE", "WD-40", "Holzleim", 
    "Montagekleber", "Silikon", "Acryl", "Lack", 
    "Farbe", "Pinsel", "Schleifpapier", "Klebeband", "Öl"
  ],
  "🌱 Gartengeräte": [
    "Rasenmäher", "Heckenschere", "Kettensäge", "Freischneider",
    "Schaufel", "Spaten", "Rechen", "Besen", 
    "Gartenschere", "Gartenschlauch", "Gießkanne"
  ],
  "📦 Zubehör & Sonstiges": [
    "Aufbewahrung", "Ersatzteil", "Akku", "Ladegerät", 
    "Schutzausrüstung", "Kabeltrommel", "Beleuchtung"
  ]
};

// Eine kleine Hilfsfunktion, die wir später für die Suche brauchen:
// Sie wirft alle Tags aus allen Kategorien in einen großen Topf.
export const getAllTags = (): string[] => {
  const allTags = new Set<string>();
  Object.values(WORKSHOP_TAXONOMY).forEach(tags => {
    tags.forEach(tag => allTags.add(tag));
  });
  return Array.from(allTags).sort();
};