import { NextRequest, NextResponse } from 'next/server';
import { query } from '../../../../lib/db';

export const dynamic = 'force-dynamic';

const SCRAPER_API = process.env.SCRAPER_API_URL ?? 'http://scraper_api:5001';

// POST /api/impostazioni/diagnostics
// body: { check: 'db' | 'llm' | 'scraper_api' }
export async function POST(req: NextRequest) {
    const { check, llm_base_url } = await req.json().catch(() => ({}));

    if (check === 'db') {
        try {
            const start = Date.now();
            await query('SELECT 1');
            return NextResponse.json({ ok: true, latency_ms: Date.now() - start });
        } catch (err: any) {
            return NextResponse.json({ ok: false, error: err.message });
        }
    }

    if (check === 'scraper_api') {
        try {
            const start = Date.now();
            const res = await fetch(`${SCRAPER_API}/health`, { cache: 'no-store' });
            const data = await res.json();
            return NextResponse.json({ ...data, latency_ms: Date.now() - start });
        } catch (err: any) {
            return NextResponse.json({ ok: false, error: `Cannot reach scraper API: ${err.message}` });
        }
    }

    if (check === 'llm') {
        try {
            const res = await fetch(`${SCRAPER_API}/llm/test`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ llm_base_url }),
            });
            const data = await res.json();
            return NextResponse.json(data);
        } catch (err: any) {
            return NextResponse.json({ ok: false, error: err.message });
        }
    }

    return NextResponse.json({ error: 'Unknown check' }, { status: 400 });
}
