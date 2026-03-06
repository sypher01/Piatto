import React from 'react';
import type { Recipe } from '../lib/queries';
import { Clock, Users, Flame, UtensilsCrossed } from 'lucide-react';
import Link from 'next/link';
import AddToCartButton from './AddToCartButton';
import './RecipeCard.css';

interface RecipeCardProps {
    recipe: Recipe;
}

export default function RecipeCard({ recipe }: RecipeCardProps) {
    const cartItem = {
        id: recipe.id,
        title: recipe.title,
        slug: recipe.slug,
        image_url: recipe.image_url ?? null,
    };

    return (
        <div className="recipe-card glass-card animate-fade-up">
            {/* Overlay link covers the whole card; the cart button sits above it via z-index */}
            <Link href={`/recipe/${recipe.slug}`} className="recipe-card-link" aria-label={recipe.title} />

            <div className="recipe-img-container">
                {recipe.image_url ? (
                    <img src={recipe.image_url} alt={recipe.title} className="recipe-img" loading="lazy" />
                ) : (
                    <div className="recipe-img-placeholder flex-center">
                        <UtensilsCrossed size={48} opacity={0.2} />
                    </div>
                )}
                {recipe.cuisine_name && (
                    <div className="recipe-badge">{recipe.cuisine_name}</div>
                )}
            </div>

            <div className="recipe-content">
                <h3 className="heading-3 recipe-title">{recipe.title}</h3>

                {recipe.pct_match !== undefined && (
                    <div className="match-indicator">
                        <div
                            className="match-bar"
                            style={{
                                width: `${recipe.pct_match}%`,
                                backgroundColor:
                                    recipe.pct_match > 80 ? 'var(--secondary)'
                                    : recipe.pct_match > 50 ? '#fbbf24'
                                    : 'var(--primary)',
                            }}
                        />
                        <span className="match-text">
                            {recipe.pct_match}% compatibile ({recipe.matched_ingredients}/{recipe.total_ingredients})
                        </span>
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
                        {recipe.difficulty && (
                            <div className="meta-item">
                                <Flame size={16} />
                                <span>{recipe.difficulty.replace('Difficoltà: ', '')}</span>
                            </div>
                        )}
                    </div>
                    <AddToCartButton recipe={cartItem} />
                </div>
            </div>
        </div>
    );
}
