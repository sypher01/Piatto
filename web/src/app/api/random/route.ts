import { type NextRequest, NextResponse } from 'next/server';
import { getRandomRecipeSlug } from '../../../lib/queries';

export async function GET(request: NextRequest) {
    const slug = await getRandomRecipeSlug();
    const origin = new URL(request.url).origin;
    const base = process.env.NEXT_BASE_PATH ?? '/recipes_web';
    const destination = slug ? `${origin}${base}/recipe/${slug}` : `${origin}${base || '/'}`;
    return NextResponse.redirect(destination);
}
