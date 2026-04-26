import { getStore } from '@netlify/blobs';

const MAX_DOWNLOADS = 5;

const RELEASE_TAG = process.env.RELEASE_TAG || 'v1.0.0';
const GH           = 'bryanmax9/NovaAI';
const BASE         = `https://github.com/${GH}/releases/download/${RELEASE_TAG}`;

const URLS = {
  windows: `${BASE}/Nova-Setup.exe`,
  mac:     `${BASE}/Nova.dmg`,
  linux:   `${BASE}/Nova.AppImage`,
} as const;

type Platform = keyof typeof URLS;

// GET /api/downloads — returns remaining slot count
export async function GET() {
  try {
    const store = getStore('nova-downloads');
    const data  = await store.get('count', { type: 'json' }).catch(() => null) as { count: number } | null;
    const used  = data?.count ?? 0;
    return Response.json({ remaining: Math.max(0, MAX_DOWNLOADS - used), total: MAX_DOWNLOADS });
  } catch {
    // Fallback when Blobs aren't available (local dev)
    return Response.json({ remaining: MAX_DOWNLOADS, total: MAX_DOWNLOADS });
  }
}

// POST /api/downloads — claim a slot, return download URL
export async function POST(req: Request) {
  let platform: Platform = 'linux';
  try {
    const body = await req.json();
    if (body.platform in URLS) platform = body.platform as Platform;
  } catch { /* ignore */ }

  try {
    const store = getStore('nova-downloads');
    const data  = await store.get('count', { type: 'json' }).catch(() => null) as { count: number } | null;
    const used  = data?.count ?? 0;

    if (used >= MAX_DOWNLOADS) {
      return Response.json(
        { error: 'All early access slots have been claimed. Join the waitlist!' },
        { status: 403 }
      );
    }

    await store.set('count', { count: used + 1 });

    return Response.json({
      url:       URLS[platform],
      remaining: Math.max(0, MAX_DOWNLOADS - (used + 1)),
      total:     MAX_DOWNLOADS,
    });
  } catch {
    // Fallback: return URL directly when Blobs aren't available (local dev)
    return Response.json({ url: URLS[platform], remaining: MAX_DOWNLOADS, total: MAX_DOWNLOADS });
  }
}
