import { query } from './db';

export interface Recipe {
    id: number;
    title: string;
    slug: string;
    description: string;
    difficulty: string;
    prep_time_min: number;
    cook_time_min: number;
    total_time_min: number;
    servings: number;
    image_url: string;
    source_url: string;
    cuisine_id: number;
    cuisine_name?: string;
    total_ingredients?: number;
    matched_ingredients?: number;
    pct_match?: number;
}

export interface Ingredient {
    id: number;
    recipe_id: number;
    sort_order: number;
    name: string;
    canonical_name: string;
    amount: number;
    unit: string;
    notes: string;
}

export interface Step {
    id: number;
    recipe_id: number;
    step_number: number;
    title: string;
    body: string;
    image_url: string;
}

export interface Nutrition {
    id: number;
    recipe_id: number;
    calories_kcal: number;
    fat_g: number;
    saturated_fat_g: number;
    carbs_g: number;
    sugar_g: number;
    fiber_g: number;
    protein_g: number;
    sodium_mg: number;
}

// Optional cuisine filter — pass null/undefined to get all
export async function getRecentRecipes(limit = 12, offset = 0, cuisineId?: number | null): Promise<{ recipes: Recipe[], total: number }> {
    const res = await query(
        `SELECT r.*, c.name as cuisine_name, COUNT(*) OVER() as full_count
         FROM recipes r
         LEFT JOIN cuisines c ON r.cuisine_id = c.id
         WHERE ($3::int IS NULL OR r.cuisine_id = $3)
         ORDER BY r.id DESC LIMIT $1 OFFSET $2`,
        [limit, offset, cuisineId ?? null]
    );

    const recipes = res.rows;
    const total = recipes.length > 0 ? parseInt(recipes[0].full_count, 10) : 0;
    return { recipes, total };
}

export async function getRecipeBySlug(slug: string): Promise<Recipe | null> {
    const res = await query(
        `SELECT r.*, c.name as cuisine_name
         FROM recipes r
         LEFT JOIN cuisines c ON r.cuisine_id = c.id
         WHERE r.slug = $1`,
        [slug]
    );
    if (res.rows.length === 0) return null;
    return res.rows[0];
}

export async function getRecipeIngredients(recipeId: number): Promise<Ingredient[]> {
    const res = await query(
        `SELECT * FROM ingredients WHERE recipe_id = $1 ORDER BY sort_order ASC`,
        [recipeId]
    );
    return res.rows;
}

export async function getRecipeSteps(recipeId: number): Promise<Step[]> {
    const res = await query(
        `SELECT * FROM steps WHERE recipe_id = $1 ORDER BY step_number ASC`,
        [recipeId]
    );
    return res.rows;
}

export async function getRecipeNutrition(recipeId: number): Promise<Nutrition | null> {
    const res = await query(
        `SELECT * FROM nutrition WHERE recipe_id = $1`,
        [recipeId]
    );
    if (res.rows.length === 0) return null;
    return res.rows[0];
}

export async function getAllCanonicalIngredients(): Promise<string[]> {
    const res = await query(
        `SELECT DISTINCT canonical_name
         FROM ingredients
         WHERE canonical_name IS NOT NULL
         ORDER BY canonical_name`
    );
    return res.rows.map((row) => row.canonical_name);
}

// Fridge match: must have ALL selected, must have NONE of excluded
export async function saveTheFridgeMatch(selected: string[], excluded: string[]): Promise<Recipe[]> {
    const res = await query(
        `SELECT r.id, r.title, r.slug, r.image_url, r.description, r.total_time_min,
                COUNT(i.id) AS total_ingredients,
                COUNT(i.id) FILTER (WHERE i.canonical_name = ANY($1::text[])) AS matched_ingredients,
                ROUND(
                  100.0 * COUNT(i.id) FILTER (WHERE i.canonical_name = ANY($1::text[])) / COUNT(i.id)
                ) AS pct_match
         FROM recipes r
         JOIN ingredients i ON i.recipe_id = r.id
         GROUP BY r.id
         HAVING COUNT(i.id) FILTER (WHERE i.canonical_name = ANY($1::text[])) = cardinality($1::text[])
            AND COUNT(i.id) FILTER (WHERE i.canonical_name = ANY($2::text[])) = 0
         ORDER BY pct_match DESC, total_ingredients ASC
         LIMIT 30;`,
        [selected, excluded]
    );
    return res.rows;
}

// Unique ingredients appearing in a set of recipes, minus what the user already has
export async function getUniqueIngredientsForRecipes(recipeIds: number[], alreadyHave: string[]): Promise<{ canonical_name: string; name: string }[]> {
    if (recipeIds.length === 0) return [];
    const res = await query(
        `SELECT i.canonical_name, MIN(i.name) as name
         FROM ingredients i
         WHERE i.recipe_id = ANY($1::int[])
           AND i.canonical_name IS NOT NULL
           AND i.canonical_name != ALL($2::text[])
         GROUP BY i.canonical_name
         ORDER BY i.canonical_name`,
        [recipeIds, alreadyHave]
    );
    return res.rows;
}

// All ingredient rows for a batch of recipe IDs — used for the shopping list
export async function getIngredientsByRecipeIds(recipeIds: number[]): Promise<Ingredient[]> {
    if (recipeIds.length === 0) return [];
    const res = await query(
        `SELECT *
         FROM ingredients
         WHERE recipe_id = ANY($1::int[])
         ORDER BY recipe_id, sort_order`,
        [recipeIds]
    );
    return res.rows;
}

export async function getCuisines() {
    const res = await query('SELECT * FROM cuisines ORDER BY name ASC');
    return res.rows;
}

export async function getRandomRecipeSlug(): Promise<string | null> {
    const res = await query('SELECT slug FROM recipes ORDER BY RANDOM() LIMIT 1');
    if (res.rows.length === 0) return null;
    return res.rows[0].slug;
}

// Missing ingredients per recipe (grouped), excluding what the user already has
export async function getMissingIngredientsByRecipe(
    recipeIds: number[],
    alreadyHave: string[]
): Promise<{ recipe_id: number; canonical_name: string; name: string }[]> {
    if (recipeIds.length === 0) return [];
    const res = await query(
        `SELECT i.recipe_id, i.canonical_name, MIN(i.name) as name
         FROM ingredients i
         WHERE i.recipe_id = ANY($1::int[])
           AND i.canonical_name IS NOT NULL
           AND i.canonical_name != ALL($2::text[])
         GROUP BY i.recipe_id, i.canonical_name
         ORDER BY i.recipe_id, i.canonical_name`,
        [recipeIds, alreadyHave]
    );
    return res.rows;
}
