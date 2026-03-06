import React from 'react';
import { getRecipeBySlug, getRecipeIngredients, getRecipeSteps, getRecipeNutrition } from '../../../lib/queries';
import { notFound } from 'next/navigation';
import { Clock, Users, Flame, UtensilsCrossed } from 'lucide-react';
import AddToCartButton from '../../../components/AddToCartButton';
import './recipe.css';

export const revalidate = 3600;

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps) {
    const resolvedParams = await params;
    const recipe = await getRecipeBySlug(resolvedParams.slug);
    if (!recipe) return { title: 'Ricetta non trovata | Piatto' };
    return {
        title: `${recipe.title} | Piatto`,
        description: recipe.description || `Come preparare ${recipe.title}`,
    };
}

export default async function RecipePage({ params }: PageProps) {
    const resolvedParams = await params;
    const recipe = await getRecipeBySlug(resolvedParams.slug);

    if (!recipe) {
        notFound();
    }

    const [ingredients, steps, nutrition] = await Promise.all([
        getRecipeIngredients(recipe.id),
        getRecipeSteps(recipe.id),
        getRecipeNutrition(recipe.id)
    ]);

    const cartItem = {
        id: recipe.id,
        title: recipe.title,
        slug: recipe.slug,
        image_url: recipe.image_url ?? null,
    };

    return (
        <div className="recipe-page">
            {/* Hero Header */}
            <div className="recipe-hero">
                {recipe.image_url ? (
                    <img src={recipe.image_url} alt={recipe.title} className="recipe-hero-img" />
                ) : (
                    <div className="recipe-hero-placeholder">
                        <UtensilsCrossed size={64} opacity={0.2} />
                    </div>
                )}
                <div className="recipe-hero-overlay"></div>
                <div className="container recipe-hero-content animate-fade-up">
                    {recipe.cuisine_name && (
                        <span className="recipe-badge-large">{recipe.cuisine_name}</span>
                    )}
                    <h1 className="heading-1 text-white">{recipe.title}</h1>
                    {recipe.description && (
                        <p className="recipe-description">{recipe.description}</p>
                    )}

                    <div className="recipe-meta-large">
                        <div className="meta-item-large" title="Tempo Totale">
                            <Clock size={24} />
                            <span>{recipe.total_time_min || recipe.prep_time_min || '?'} min</span>
                        </div>
                        {recipe.servings && (
                            <div className="meta-item-large" title="Porzioni">
                                <Users size={24} />
                                <span>{recipe.servings} persone</span>
                            </div>
                        )}
                        {recipe.difficulty && (
                            <div className="meta-item-large" title="Difficoltà">
                                <Flame size={24} />
                                <span>{recipe.difficulty.replace('Difficoltà: ', '')}</span>
                            </div>
                        )}
                        <AddToCartButton recipe={cartItem} variant="full" />
                    </div>
                </div>
            </div>

            <div className="container recipe-content-grid section-padding">
                {/* Left Column: Ingredients & Nutrition */}
                <div className="recipe-sidebar animate-fade-up delay-100">
                    <div className="glass-card p-6 mb-8">
                        <h3 className="heading-3 mb-4">Ingredienti</h3>
                        <ul className="ingredients-list">
                            {ingredients.map((ing) => (
                                <li key={ing.id} className="ingredient-item">
                                    <div className="ingredient-amount">
                                        {ing.amount && <span className="font-bold">{ing.amount.toString().replace(/\.000$/, '')}</span>}
                                        {ing.unit && <span className="unit">{ing.unit}</span>}
                                    </div>
                                    <div className="ingredient-name">
                                        <span>{ing.name}</span>
                                        {ing.notes && <span className="ingredient-notes">({ing.notes})</span>}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {nutrition && (
                        <div className="glass-card p-6">
                            <h3 className="heading-3 mb-4">Valori nutrizionali per porzione</h3>
                            <div className="nutrition-grid">
                                <div className="nutrition-item">
                                    <span className="nutrition-value">{nutrition.calories_kcal || 0}</span>
                                    <span className="nutrition-label">kcal</span>
                                </div>
                                <div className="nutrition-item">
                                    <span className="nutrition-value">{nutrition.protein_g || 0}g</span>
                                    <span className="nutrition-label">Proteine</span>
                                </div>
                                <div className="nutrition-item">
                                    <span className="nutrition-value">{nutrition.carbs_g || 0}g</span>
                                    <span className="nutrition-label">Carboidrati</span>
                                </div>
                                <div className="nutrition-item">
                                    <span className="nutrition-value">{nutrition.fat_g || 0}g</span>
                                    <span className="nutrition-label">Grassi</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Column: Steps */}
                <div className="recipe-main animate-fade-up delay-200">
                    <h2 className="heading-2 mb-6">Istruzioni</h2>
                    <div className="steps-container">
                        {steps.map((step) => (
                            <div key={step.id} className="step-card glass-card">
                                <div className="step-number">{step.step_number}</div>
                                <div className="step-content">
                                    {step.title && <h4 className="step-title">{step.title}</h4>}
                                    <p className="step-body">{step.body}</p>
                                </div>
                                {step.image_url && (
                                    <div className="step-image">
                                        <img src={step.image_url} alt={`Step ${step.step_number}`} loading="lazy" />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
