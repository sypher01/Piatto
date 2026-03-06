import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const SCRAPER_API = process.env.SCRAPER_API_URL ?? 'http://scraper_api:5001';

export async function GET() {
    try {
        const res = await fetch(`${SCRAPER_API}/config`, { cache: 'no-store' });
        const data = await res.json();
        return NextResponse.json(data);
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 503 });
    }
}

export async function POST(req: NextRequest) {
    const body = await req.json().catch(() => ({}));
    try {
        const res = await fetch(`${SCRAPER_API}/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await res.json();
        return NextResponse.json(data, { status: res.status });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 503 });
    }
}
