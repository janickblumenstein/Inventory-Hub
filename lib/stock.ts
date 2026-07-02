// Bestandsführung pro Item. Drei Modi:
// - 'count' (Default): klassische Stückzahl + optionaler Mindestbestand
// - 'level': Füllstand-Ampel (Voll/Ausreichend/Knapp/Leer) für Dinge, bei
//   denen exaktes Zählen keinen Sinn ergibt (Schrauben, Verbrauchsmaterial)
// - 'none': keine Bestandsführung (z.B. Kisten, deren Inhalt nur über Tags
//   beschrieben ist)
export type StockMode = 'count' | 'level' | 'none';
export type StockLevel = 'full' | 'ok' | 'low' | 'empty';

export const STOCK_LEVELS: Record<StockLevel, { label: string; emoji: string; badge: string }> = {
  full:  { label: 'Voll',        emoji: '🟢', badge: 'bg-green-100 text-green-800 border-green-300' },
  ok:    { label: 'Ausreichend', emoji: '🔵', badge: 'bg-blue-100 text-blue-800 border-blue-300' },
  low:   { label: 'Knapp',       emoji: '🟠', badge: 'bg-orange-100 text-orange-800 border-orange-300' },
  empty: { label: 'Leer',        emoji: '🔴', badge: 'bg-red-100 text-red-800 border-red-300' },
};

export const STOCK_LEVEL_ORDER: StockLevel[] = ['full', 'ok', 'low', 'empty'];

export function getStockMode(item: any): StockMode {
  return item?.stockMode === 'level' || item?.stockMode === 'none' ? item.stockMode : 'count';
}

export function getStockLevel(item: any): StockLevel {
  return STOCK_LEVEL_ORDER.includes(item?.stockLevel) ? item.stockLevel : 'ok';
}

// Nächster Füllstand beim Durchtippen (Voll -> Ausreichend -> Knapp -> Leer -> Voll)
export function nextStockLevel(level: StockLevel): StockLevel {
  const i = STOCK_LEVEL_ORDER.indexOf(level);
  return STOCK_LEVEL_ORDER[(i + 1) % STOCK_LEVEL_ORDER.length];
}

// Braucht das Item Nachschub? (unabhängig vom Modus)
export function isLowStock(item: any): boolean {
  const mode = getStockMode(item);
  if (mode === 'none') return false;
  if (mode === 'level') {
    const l = getStockLevel(item);
    return l === 'low' || l === 'empty';
  }
  return item?.minQuantity != null && (Number(item.quantity) || 0) <= Number(item.minQuantity);
}
