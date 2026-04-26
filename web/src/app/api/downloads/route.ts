import { getStore } from '@netlify/blobs';

const MAX_DOWNLOADS = 8;

const BASE = 'https://github.com/bryanmax9/NovaAI/releases/download/v1.0.0';

const URLS = {
  windows: `${BASE}/Nova.Setup.1.0.0.exe`,
  mac:     `${BASE}/Nova-1.0.0.dmg`,
  linux:   `${BASE}/Nova-1.0.0.AppImage`,
} as const;

type Platform = keyof typeof URLS;

async function getUsed(store: ReturnType<typeof getStore>): Promise<number> {
  try {
    const raw = await store.get('count-v2', { type: 'text' });
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    return typeof parsed?.count === 'number' ? parsed.count : 0;
  } catch {
    return 0;
  }
}

// GET /api/downloads — returns remaining slot count
export async function GET() {
  try {
    const store = getStore('nova-downloads');
    const used  = await getUsed(store);
    return Response.json({ remaining: Math.max(0, MAX_DOWNLOADS - used), total: MAX_DOWNLOADS });
  } catch {
    return Response.json({ remaining: MAX_DOWNLOADS, total: MAX_DOWNLOADS });
  }
}

// POST /api/downloads — kept for future use
export async function POST(req: Request) {
  let platform: Platform = 'linux';
  try {
    const body = await req.json();
    if (body.platform in URLS) platform = body.platform as Platform;
  } catch { /* ignore */ }

  try {
    const store = getStore('nova-downloads');
    const used  = await getUsed(store);
    if (used >= MAX_DOWNLOADS) {
      return Response.json({ error: 'All early access slots have been claimed.' }, { status: 403 });
    }
    await store.set('count-v2', JSON.stringify({ count: used + 1 }));
    return Response.json({ url: URLS[platform], remaining: Math.max(0, MAX_DOWNLOADS - (used + 1)), total: MAX_DOWNLOADS });
  } catch {
    return Response.json({ url: URLS[platform], remaining: MAX_DOWNLOADS, total: MAX_DOWNLOADS });
  }
}
