import { type NextRequest, NextResponse } from 'next/server';
import { getRandomRecipeSlug } from '../../../lib/queries';

export async function GET(request: NextRequest) {
    const slug = await getRandomRecipeSlug();
    // Use the Host header forwarded by nginx so the redirect goes to the
    // external address (not the internal Docker hostname).
    const proto = request.headers.get('x-forwarded-proto') ?? new URL(request.url).protocol.replace(':', '');
    const host  = request.headers.get('host') ?? new URL(request.url).host;
    const origin = `${proto}://${host}`;
    const base = process.env.NEXT_BASE_PATH ?? '/recipes_web';
    const destination = slug ? `${origin}${base}/recipe/${slug}` : `${origin}${base || '/'}`;
    return NextResponse.redirect(destination);
}
