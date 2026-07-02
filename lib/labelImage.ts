// Rendert Etiketten als PNG (Base64, ohne data:-Prefix) für den Brother-Druck.
//
// Wichtig für den PT-P710BT (Thermodruck, 180 dpi):
// - Auf 24-mm-Tape sind exakt 128 Druckpunkte Höhe verfügbar. Wir rendern
//   GENAU in dieser Auflösung, damit das SDK nicht skaliert (keine Unschärfe).
// - Die Etikettenlänge passt sich dem Inhalt an (so kurz wie möglich);
//   die konfigurierte Länge (Settings) wirkt als Obergrenze.
// - QR mit Ruhezone (weißer Rand) und ganzzahligen Modul-Pixeln -> scannbar.
// - Am Ende ein harter Schwarz/Weiß-Threshold: Thermodrucker können kein Grau.
import QRCode from 'qrcode';

export type LabelItem = {
  id: string;
  name?: string;
  tags?: string[];
};

export type LabelLocation = {
  id: string;
  name?: string;
  code?: string;
};

export type LabelLoan = {
  borrowerName?: string;
  quantity?: number;
  borrowDate?: string | null;
  expectedReturnDate?: string | null;
};

const DPI = 180;
const LABEL_HEIGHT = 128;          // druckbare Höhe auf 24-mm-Tape
export const DEFAULT_LABEL_LENGTH_MM = 60;

export function buildItemLabelUrl(origin: string, itemId: string): string {
  return `${origin}/item/${itemId}`;
}

export function buildLocationLabelUrl(origin: string, locationId: string): string {
  return `${origin}/locations/${locationId}`;
}

function mmToPx(mm: number): number {
  return Math.round((mm / 25.4) * DPI);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// QR mit ganzzahligem Modul-Maßstab rendern (scharfe Kanten) und so groß wie
// möglich innerhalb von maxSize. margin:2 Module Ruhezone ist einkalkuliert.
async function renderQr(url: string, maxSize: number): Promise<HTMLImageElement> {
  for (const scale of [5, 4, 3, 2]) {
    const dataUrl = await QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 2, scale });
    const img = await loadImage(dataUrl);
    if (img.height <= maxSize) return img;
  }
  const dataUrl = await QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 2, width: maxSize });
  return loadImage(dataUrl);
}

type Line = { text: string; kind: 'title' | 'mono' | 'small' };
type FittedLine = { text: string; font: string; h: number };

// Text einpassen: Font verkleinern bis er passt, sonst mit „…" kürzen.
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, startPx: number, minPx: number, weight: string, family: string): { text: string; font: string } {
  let size = startPx;
  while (size > minPx) {
    ctx.font = `${weight} ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) return { text, font: ctx.font };
    size -= 2;
  }
  ctx.font = `${weight} ${minPx}px ${family}`;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
  return { text: t + (t !== text ? '…' : ''), font: ctx.font };
}

// Titel einpassen: erst schrumpfend in einer Zeile versuchen, dann auf
// zwei Zeilen umbrechen (Wortgrenzen) statt abzuschneiden.
function fitTitle(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: 1 | 2): FittedLine[] {
  const family = 'Arial, sans-serif';
  for (let size = 34; size >= 20; size -= 2) {
    ctx.font = `bold ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) return [{ text, font: ctx.font, h: size + 6 }];
  }
  if (maxLines === 2) {
    const size = 24;
    ctx.font = `bold ${size}px ${family}`;
    const words = text.split(/\s+/);
    let line1 = '';
    let i = 0;
    while (i < words.length) {
      const test = line1 ? `${line1} ${words[i]}` : words[i];
      if (ctx.measureText(test).width <= maxWidth) { line1 = test; i++; }
      else break;
    }
    // Nur wenn ein sauberer Wortumbruch möglich ist, zweizeilig rendern.
    if (line1 && i > 0 && i < words.length) {
      const rest = words.slice(i).join(' ');
      let line2 = rest;
      while (line2.length > 1 && ctx.measureText(line2 + '…').width > maxWidth) line2 = line2.slice(0, -1);
      return [
        { text: line1, font: ctx.font, h: size + 5 },
        { text: line2 + (line2 !== rest ? '…' : ''), font: ctx.font, h: size + 5 },
      ];
    }
  }
  return [{ ...fitText(ctx, text, maxWidth, 20, 18, 'bold', family), h: 26 }];
}

function fitLines(ctx: CanvasRenderingContext2D, lines: Line[], maxTextWidth: number, maxTitleLines: 1 | 2): FittedLine[] {
  return lines
    .filter(l => l.text.trim() !== '')
    .flatMap(l => {
      if (l.kind === 'title') return fitTitle(ctx, l.text, maxTextWidth, maxTitleLines);
      if (l.kind === 'mono') return [{ ...fitText(ctx, l.text, maxTextWidth, 22, 14, 'bold', 'monospace'), h: 26 }];
      return [{ ...fitText(ctx, l.text, maxTextWidth, 18, 12, 'normal', 'Arial, sans-serif'), h: 22 }];
    });
}

// Alles unter dieser Helligkeit wird schwarz, der Rest weiß.
function applyThreshold(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const v = lum < 150 ? 0 : 255;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
}

async function renderLabel(qrUrl: string, lines: Line[], maxLengthMm: number, maxTitleLines: 1 | 2 = 2): Promise<string> {
  const height = LABEL_HEIGHT;
  const maxWidth = Math.max(mmToPx(Math.max(maxLengthMm, 30)), height + 40);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D-Kontext nicht verfügbar');

  const qrImg = await renderQr(qrUrl, height - 4);
  const qrX = 2;
  const textX = qrX + qrImg.width + 8;

  // Phase 1: Zeilen gegen die maximal verfügbare Breite einpassen und messen.
  let fitted = fitLines(ctx, lines, maxWidth - textX - 6, maxTitleLines);
  // Passt es in der Höhe nicht (z.B. 2-zeiliger Titel + viele Infozeilen),
  // den Titel auf eine Zeile reduzieren.
  if (fitted.reduce((s, l) => s + l.h, 0) > height - 2 && maxTitleLines === 2) {
    fitted = fitLines(ctx, lines, maxWidth - textX - 6, 1);
  }
  let actualTextWidth = 0;
  for (const line of fitted) {
    ctx.font = line.font;
    actualTextWidth = Math.max(actualTextWidth, ctx.measureText(line.text).width);
  }

  // Etikett nur so lang wie nötig (Inhalt), gedeckelt durch das Maximum.
  // Ohne Textzeilen (nur QR) wird es minimal: QR + Rand.
  const width = fitted.length === 0
    ? qrImg.width + 8
    : Math.min(maxWidth, Math.ceil(textX + actualTextWidth + 8));

  // Phase 2: Canvas final dimensionieren (setzt den Kontext zurück) und zeichnen.
  canvas.width = width;
  canvas.height = height;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(qrImg, qrX, Math.round((height - qrImg.height) / 2));

  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'middle';
  const totalH = fitted.reduce((s, l) => s + l.h, 0);
  let y = Math.round((height - totalH) / 2);
  for (const line of fitted) {
    ctx.font = line.font;
    ctx.fillText(line.text, textX, y + line.h / 2);
    y += line.h;
  }

  applyThreshold(ctx, width, height);
  return canvas.toDataURL('image/png').split(',')[1];
}

// 🏷️ Item-Etikett: QR -> /item/{id}, daneben Name + Tags. Bewusst kompakt –
// ohne Lagerort-Code und ohne Eigentümer (steht alles in der App hinterm QR).
// withText=false druckt nur den QR-Code (minimales Tape).
export async function renderLabelToPng(
  item: LabelItem,
  _ownerName: string,
  origin: string,
  maxLengthMm: number = DEFAULT_LABEL_LENGTH_MM,
  withText: boolean = true
): Promise<string> {
  const tagLine = (item.tags || []).slice(0, 3).join(' · ');
  return renderLabel(
    buildItemLabelUrl(origin, item.id),
    withText
      ? [
          { text: (item.name || 'Item').toUpperCase(), kind: 'title' },
          { text: tagLine, kind: 'small' },
        ]
      : [],
    maxLengthMm
  );
}

// 📍 Lagerort-Etikett: QR -> /locations/{id}, daneben Name (+ Code, falls gesetzt).
export async function renderLocationLabelToPng(
  loc: LabelLocation,
  _ownerName: string,
  origin: string,
  maxLengthMm: number = DEFAULT_LABEL_LENGTH_MM,
  withText: boolean = true
): Promise<string> {
  return renderLabel(
    buildLocationLabelUrl(origin, loc.id),
    withText
      ? [
          { text: (loc.name || 'Lagerort').toUpperCase(), kind: 'title' },
          { text: loc.code || '', kind: 'mono' },
        ]
      : [],
    maxLengthMm
  );
}

// 🤝 Verleih-Etikett: hier gehören Eigentümer, Ausleiher und die Daten drauf –
// der Text ist der Zweck dieses Etiketts, daher immer mit Text. Der Titel
// bleibt einzeilig, damit die Infozeilen Platz haben.
export async function renderLoanLabelToPng(
  item: LabelItem,
  loan: LabelLoan,
  ownerName: string,
  origin: string,
  maxLengthMm: number = 90
): Promise<string> {
  const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString('de-CH') : '');
  const since = fmt(loan.borrowDate);
  const back = fmt(loan.expectedReturnDate);
  const dateLine = [since ? `Seit: ${since}` : '', back ? `Zurück: ${back}` : ''].filter(Boolean).join(' · ');
  return renderLabel(
    buildItemLabelUrl(origin, item.id),
    [
      { text: (item.name || 'Item').toUpperCase(), kind: 'title' },
      { text: `Eigentum: ${ownerName || 'ShedSync'}`, kind: 'small' },
      { text: `An: ${loan.borrowerName || '?'}${loan.quantity && loan.quantity > 1 ? ` (${loan.quantity}x)` : ''}`, kind: 'small' },
      { text: dateLine, kind: 'small' },
    ],
    maxLengthMm,
    1
  );
}
