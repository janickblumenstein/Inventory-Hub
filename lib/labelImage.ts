// Rendert ein Item-Etikett als PNG (Base64, ohne data:-Prefix).
// Wird für den nativen Brother-Druck gebraucht (das Plugin druckt ein Bild).
// Layout entspricht dem Browser-Etikett: QR links, Text rechts, Höhe fürs Tape.
import QRCode from 'qrcode';

export type LabelItem = {
  id: string;
  name?: string;
};

// Link, den der QR-Code kodiert -> öffnet/scannt zurück auf die Item-Seite.
export function buildItemLabelUrl(origin: string, itemId: string): string {
  return `${origin}/item/${itemId}`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Höhe = Tape-Breite (24 mm) bei ~180 dpi. Breite wächst mit dem Text.
const LABEL_HEIGHT = 176;
const QR_SIZE = 150;
const PADDING = 12;

export async function renderLabelToPng(
  item: LabelItem,
  ownerName: string,
  origin: string
): Promise<string> {
  const url = buildItemLabelUrl(origin, item.id);
  const qrDataUrl = await QRCode.toDataURL(url, { margin: 0, width: QR_SIZE });
  const qrImg = await loadImage(qrDataUrl);

  const name = (item.name || 'Item').toUpperCase();
  const owner = ownerName || '';

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D-Kontext nicht verfügbar');

  // Textbreite ausmessen, um die Etiketten-Breite zu bestimmen.
  const nameFont = 'bold 34px Arial, sans-serif';
  const metaFont = '20px Arial, sans-serif';
  ctx.font = nameFont;
  const nameWidth = ctx.measureText(name).width;
  ctx.font = metaFont;
  const ownerWidth = owner ? ctx.measureText(owner).width : 0;
  const textWidth = Math.ceil(Math.max(nameWidth, ownerWidth));

  const textBlockX = PADDING + QR_SIZE + PADDING;
  const width = textBlockX + textWidth + PADDING;

  canvas.width = width;
  canvas.height = LABEL_HEIGHT;

  // Hintergrund weiß (Thermodruck).
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, LABEL_HEIGHT);

  // QR-Code links, vertikal zentriert.
  ctx.drawImage(qrImg, PADDING, (LABEL_HEIGHT - QR_SIZE) / 2, QR_SIZE, QR_SIZE);

  // Text rechts.
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'middle';
  if (owner) {
    ctx.font = nameFont;
    ctx.fillText(name, textBlockX, LABEL_HEIGHT / 2 - 16);
    ctx.font = metaFont;
    ctx.fillText(owner, textBlockX, LABEL_HEIGHT / 2 + 24);
  } else {
    ctx.font = nameFont;
    ctx.fillText(name, textBlockX, LABEL_HEIGHT / 2);
  }

  // Base64 ohne "data:image/png;base64,"-Prefix zurückgeben.
  return canvas.toDataURL('image/png').split(',')[1];
}
