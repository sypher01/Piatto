'use server';

import { saveTheFridgeMatch, getMissingIngredientsByRecipe, getIngredientsByRecipeIds } from './queries';
import type { Recipe, Ingredient } from './queries';

export interface FridgeIngredient {
    canonical_name: string;
    name: string;
}

export interface FridgeRecipe extends Recipe {
    missingIngredients: FridgeIngredient[];
}

export interface FridgeResult {
    recipes: FridgeRecipe[];
}

export async function findRecipesFromFridge(selected: string[], excluded: string[]): Promise<FridgeResult> {
    if (!selected || selected.length === 0) return { recipes: [] };

    const recipes = await saveTheFridgeMatch(selected, excluded);
    const recipeIds = recipes.map((r) => r.id);
    const missingRows = await getMissingIngredientsByRecipe(recipeIds, selected);

    // Group missing ingredients by recipe_id
    const missingByRecipe = new Map<number, FridgeIngredient[]>();
    for (const row of missingRows) {
        if (!missingByRecipe.has(row.recipe_id)) missingByRecipe.set(row.recipe_id, []);
        missingByRecipe.get(row.recipe_id)!.push({ canonical_name: row.canonical_name, name: row.name });
    }

    const fridgeRecipes: FridgeRecipe[] = recipes.map((r) => ({
        ...r,
        missingIngredients: missingByRecipe.get(r.id) ?? [],
    }));

    return { recipes: fridgeRecipes };
}

export async function getIngredientsForCart(recipeIds: number[]): Promise<Ingredient[]> {
    if (!recipeIds || recipeIds.length === 0) return [];
    return await getIngredientsByRecipeIds(recipeIds);
}
