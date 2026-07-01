// Rendert Etiketten als PNG (Base64, ohne data:-Prefix) für den Brother-Druck.
//
// Wichtig für den PT-P710BT (Thermodruck, 180 dpi):
// - Auf 24-mm-Tape sind exakt 128 Druckpunkte Höhe verfügbar. Wir rendern
//   GENAU in dieser Auflösung, damit das SDK nicht skaliert (keine Unschärfe).
// - Feste Etikettenlänge (mm, konfigurierbar), damit das Tape nicht endlos läuft.
// - QR mit Ruhezone (weißer Rand) und ganzzahligen Modul-Pixeln -> scannbar.
// - Am Ende ein harter Schwarz/Weiß-Threshold: Thermodrucker können kein Grau,
//   Antialiasing-Kanten würden sonst zu Pixelmatsch gerastert.
import QRCode from 'qrcode';

export type LabelItem = {
  id: string;
  name?: string;
  locationCode?: string; // Kürzel des Lagerorts, z.B. "LOC-A4F2"
};

export type LabelLocation = {
  id: string;
  name?: string;
  code?: string;
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

async function renderLabel(
  qrUrl: string,
  lines: { text: string; kind: 'title' | 'mono' | 'small' }[],
  lengthMm: number
): Promise<string> {
  const width = Math.max(mmToPx(lengthMm), LABEL_HEIGHT + 40);
  const height = LABEL_HEIGHT;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D-Kontext nicht verfügbar');

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // QR links, pixelgenau positioniert.
  const qrImg = await renderQr(qrUrl, height - 4);
  const qrX = 2;
  const qrY = Math.round((height - qrImg.height) / 2);
  ctx.drawImage(qrImg, qrX, qrY);

  // Textblock rechts vom QR.
  const textX = qrX + qrImg.width + 8;
  const maxTextWidth = width - textX - 6;
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'middle';

  const fitted = lines
    .filter(l => l.text.trim() !== '')
    .map(l => {
      if (l.kind === 'title') return { ...fitText(ctx, l.text, maxTextWidth, 34, 18, 'bold', 'Arial, sans-serif'), h: 38 };
      if (l.kind === 'mono') return { ...fitText(ctx, l.text, maxTextWidth, 22, 14, 'bold', 'monospace'), h: 26 };
      return { ...fitText(ctx, l.text, maxTextWidth, 18, 12, 'normal', 'Arial, sans-serif'), h: 22 };
    });

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

// 🏷️ Item-Etikett: QR -> /item/{id}, daneben Name, Lagerort-Code, Eigentümer.
export async function renderLabelToPng(
  item: LabelItem,
  ownerName: string,
  origin: string,
  lengthMm: number = DEFAULT_LABEL_LENGTH_MM
): Promise<string> {
  return renderLabel(
    buildItemLabelUrl(origin, item.id),
    [
      { text: (item.name || 'Item').toUpperCase(), kind: 'title' },
      { text: item.locationCode || '', kind: 'mono' },
      { text: ownerName || '', kind: 'small' },
    ],
    lengthMm
  );
}

// 📍 Lagerort-Etikett: QR -> /locations/{id}, daneben Name + Code.
export async function renderLocationLabelToPng(
  loc: LabelLocation,
  ownerName: string,
  origin: string,
  lengthMm: number = DEFAULT_LABEL_LENGTH_MM
): Promise<string> {
  return renderLabel(
    buildLocationLabelUrl(origin, loc.id),
    [
      { text: (loc.name || 'Lagerort').toUpperCase(), kind: 'title' },
      { text: loc.code || '', kind: 'mono' },
      { text: ownerName || '', kind: 'small' },
    ],
    lengthMm
  );
}
