import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const SCRAPER_API = process.env.SCRAPER_API_URL ?? 'http://scraper_api:5001';

// GET /api/impostazioni/scraper — return recent run history
export async function GET() {
    try {
        const res = await fetch(`${SCRAPER_API}/status`, { cache: 'no-store' });
        const data = await res.json();
        return NextResponse.json(data);
    } catch (err: any) {
        return NextResponse.json({ error: `Cannot reach scraper API: ${err.message}` }, { status: 503 });
    }
}

// POST /api/impostazioni/scraper — trigger a run
// body: { job: 'scraper' | 'normalizer' }
export async function POST(req: NextRequest) {
    const body = await req.json().catch(() => ({}));
    const job = body.job === 'normalizer' ? 'normalizer' : 'scraper';
    try {
        const res = await fetch(`${SCRAPER_API}/run/${job}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        });
        const data = await res.json();
        if (!res.ok) return NextResponse.json(data, { status: res.status });
        return NextResponse.json(data);
    } catch (err: any) {
        return NextResponse.json({ error: `Cannot reach scraper API: ${err.message}` }, { status: 503 });
    }
}
