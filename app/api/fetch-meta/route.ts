import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export async function POST(request: Request) {
  try {
    const { url } = await request.json();
    if (!url) return NextResponse.json({ error: 'Keine URL angegeben' }, { status: 400 });

    // 🔥 DIE TARNKAPPE: Wir tun so, als wären wir ein normaler Windows-Chrome-Browser!
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'de-CH,de;q=0.9,en-US;q=0.8,en;q=0.7',
      }
    });

    const html = await res.text();
    const $ = cheerio.load(html);

    let title = $('meta[property="og:title"]').attr('content') || $('title').text() || '';
    let imageUrl = $('meta[property="og:image"]').attr('content') || '';

    // Falls Galaxus uns trotzdem blockt (Access Denied), geben wir lieber keinen Namen zurück als den Fehler-Namen
    if (title.toLowerCase().includes('access denied') || title.toLowerCase().includes('cloudflare')) {
        title = ''; 
    }

    return NextResponse.json({ title: title.trim(), imageUrl });
  } catch (error) {
    return NextResponse.json({ error: 'Fehler beim Scrapen' }, { status: 500 });
  }
}