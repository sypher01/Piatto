'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Clock, Users, UtensilsCrossed, ChevronDown, ChevronUp, X } from 'lucide-react';
import type { FridgeRecipe, FridgeIngredient } from '../lib/actions';
import AddToCartButton from './AddToCartButton';
import './RecipeCard.css';
import './FridgeRecipeCard.css';

interface Props {
    recipe: FridgeRecipe;
    excludedIngredients: string[];
    onToggleExclusion: (canonicalName: string) => void;
}

export default function FridgeRecipeCard({ recipe, excludedIngredients, onToggleExclusion }: Props) {
    const [dropdownOpen, setDropdownOpen] = useState(false);

    const cartItem = {
        id: recipe.id,
        title: recipe.title,
        slug: recipe.slug,
        image_url: recipe.image_url ?? null,
    };

    const matchColor =
        (recipe.pct_match ?? 0) > 80 ? 'var(--secondary)'
        : (recipe.pct_match ?? 0) > 50 ? '#fbbf24'
        : 'var(--primary)';

    return (
        <div className="recipe-card glass-card animate-fade-up">
            <Link href={`/recipe/${recipe.slug}`} className="recipe-card-link" aria-label={recipe.title} />

            <div className="recipe-img-container">
                {recipe.image_url ? (
                    <img src={recipe.image_url} alt={recipe.title} className="recipe-img" loading="lazy" />
                ) : (
                    <div className="recipe-img-placeholder flex-center">
                        <UtensilsCrossed size={48} opacity={0.2} />
                    </div>
                )}
            </div>

            <div className="recipe-content">
                <h3 className="heading-3 recipe-title">{recipe.title}</h3>

                {/* Clickable match badge — toggles missing ingredients dropdown */}
                <button
                    className="fridge-match-badge"
                    style={{ '--match-color': matchColor } as React.CSSProperties}
                    onClick={() => setDropdownOpen((v) => !v)}
                    title={dropdownOpen ? 'Chiudi ingredienti mancanti' : 'Vedi ingredienti mancanti'}
                >
                    <div
                        className="match-bar"
                        style={{ width: `${recipe.pct_match}%`, backgroundColor: matchColor }}
                    />
                    <div className="fridge-match-badge-row">
                        <span className="match-text">
                            {recipe.pct_match}% compatibile ({recipe.matched_ingredients}/{recipe.total_ingredients})
                        </span>
                        {dropdownOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </div>
                </button>

                {/* Missing ingredients dropdown */}
                {dropdownOpen && (
                    <div className="fridge-missing-dropdown">
                        {recipe.missingIngredients.length === 0 ? (
                            <p className="fridge-missing-empty">Hai tutti gli ingredienti!</p>
                        ) : (
                            <>
                                <p className="fridge-missing-hint">
                                    Clicca su un ingrediente per <strong>escluderlo</strong> (non ce l'hai)
                                </p>
                                <div className="fridge-missing-chips">
                                    {recipe.missingIngredients.map((ing: FridgeIngredient) => {
                                        const isExcluded = excludedIngredients.includes(ing.canonical_name);
                                        return (
                                            <button
                                                key={ing.canonical_name}
                                                className={`fridge-missing-chip ${isExcluded ? 'excluded' : ''}`}
                                                onClick={() => onToggleExclusion(ing.canonical_name)}
                                                title={isExcluded ? 'Clicca per re-includere' : 'Clicca per escludere'}
                                            >
                                                {isExcluded && <X size={11} />}
                                                {ing.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            </>
                        )}
                    </div>
                )}

                <div className="recipe-card-footer">
                    <div className="recipe-meta">
                        <div className="meta-item">
                            <Clock size={16} />
                            <span>{recipe.total_time_min || recipe.prep_time_min || '?'} min</span>
                        </div>
                        {recipe.servings && (
                            <div className="meta-item">
                                <Users size={16} />
                                <span>{recipe.servings} p.</span>
                            </div>
                        )}
                    </div>
                    <AddToCartButton recipe={cartItem} />
                </div>
            </div>
        </div>
    );
}
