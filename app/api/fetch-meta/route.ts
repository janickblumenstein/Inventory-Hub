import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { url } = await request.json();
    if (!url) return NextResponse.json({ error: 'Keine URL angegeben' }, { status: 400 });

    // 🔥 DIE WUNDERWAFFE: Microlink API. 
    // Sie nutzt Headless-Browser und Proxy-Rotation, um an WAFs (wie Cloudflare) vorbeizukommen.
    const microlinkUrl = `https://api.microlink.io?url=${encodeURIComponent(url)}`;
    
    const res = await fetch(microlinkUrl);
    const data = await res.json();

    if (data.status === 'success' && data.data) {
      const title = data.data.title || '';
      const imageUrl = data.data.image?.url || data.data.logo?.url || '';

      // Falls Galaxus uns trotzdem erwischt
      if (title.toLowerCase().includes('access denied') || title.toLowerCase().includes('just a moment')) {
        return NextResponse.json({ error: 'Shop blockiert die Anfrage' }, { status: 403 });
      }

      return NextResponse.json({ title: title.trim(), imageUrl });
    }

    return NextResponse.json({ error: 'Fehler beim Extrahieren' }, { status: 500 });
  } catch (error) {
    return NextResponse.json({ error: 'Server Fehler' }, { status: 500 });
  }
}