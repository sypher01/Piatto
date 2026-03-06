import { NextResponse } from 'next/server';
import { query } from '../../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const res = await query(`
            SELECT
                (SELECT COUNT(*) FROM recipes)                                   AS recipes,
                (SELECT COUNT(*) FROM ingredients)                               AS ingredients,
                (SELECT COUNT(DISTINCT canonical_name) FROM ingredients
                 WHERE canonical_name IS NOT NULL)                               AS unique_ingredients,
                (SELECT COUNT(*) FROM ingredient_mappings)                       AS llm_mappings,
                (SELECT COUNT(*) FROM cuisines)                                  AS cuisines,
                (SELECT COUNT(*) FROM categories)                                AS categories,
                (SELECT MAX(scraped_at) FROM recipes)                            AS last_scraped,
                (SELECT pg_size_pretty(pg_database_size(current_database())))    AS db_size
        `);
        return NextResponse.json(res.rows[0]);
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
