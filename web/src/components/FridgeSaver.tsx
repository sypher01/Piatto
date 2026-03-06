'use client';

import React, { useState, useTransition } from 'react';
import { findRecipesFromFridge } from '../lib/actions';
import type { FridgeRecipe } from '../lib/actions';
import FridgeRecipeCard from './FridgeRecipeCard';
import { ChefHat, Plus, X, Loader2 } from 'lucide-react';
import './FridgeSaver.css';

interface FridgeSaverProps {
    availableIngredients: string[];
}

export default function FridgeSaver({ availableIngredients }: FridgeSaverProps) {
    const [selectedIngredients, setSelectedIngredients] = useState<string[]>([]);
    const [excludedIngredients, setExcludedIngredients] = useState<string[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [recipes, setRecipes] = useState<FridgeRecipe[]>([]);
    const [isPending, startTransition] = useTransition();

    const runSearch = (selected: string[], excluded: string[]) => {
        if (selected.length === 0) {
            setRecipes([]);
            return;
        }
        startTransition(async () => {
            const { recipes: found } = await findRecipesFromFridge(selected, excluded);
            setRecipes(found);
        });
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setInputValue(val);
        if (val.length > 1) {
            const filtered = availableIngredients
                .filter((ing) => ing.toLowerCase().includes(val.toLowerCase()) && !selectedIngredients.includes(ing))
                .slice(0, 6);
            setSuggestions(filtered);
        } else {
            setSuggestions([]);
        }
    };

    const addIngredient = (ingredient: string) => {
        if (!selectedIngredients.includes(ingredient)) {
            const newSelected = [...selectedIngredients, ingredient];
            const newExcluded = excludedIngredients.filter((e) => e !== ingredient);
            setSelectedIngredients(newSelected);
            setExcludedIngredients(newExcluded);
            setInputValue('');
            setSuggestions([]);
            runSearch(newSelected, newExcluded);
        }
    };

    const removeIngredient = (ingredient: string) => {
        const newSelected = selectedIngredients.filter((i) => i !== ingredient);
        setSelectedIngredients(newSelected);
        runSearch(newSelected, excludedIngredients);
    };

    const toggleExclusion = (canonicalName: string) => {
        const newExcluded = excludedIngredients.includes(canonicalName)
            ? excludedIngredients.filter((e) => e !== canonicalName)
            : [...excludedIngredients, canonicalName];
        setExcludedIngredients(newExcluded);
        runSearch(selectedIngredients, newExcluded);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const match = availableIngredients.find((i) => i.toLowerCase() === inputValue.toLowerCase());
            if (match) {
                addIngredient(match);
            } else if (suggestions.length > 0) {
                addIngredient(suggestions[0]);
            }
        }
    };

    return (
        <div className="fridge-saver">
            <div className="fridge-header">
                <div className="icon-wrapper">
                    <ChefHat size={32} />
                </div>
                <h2 className="heading-2">Cosa c'è nel tuo frigo?</h2>
                <p className="text-muted text-center" style={{ maxWidth: '500px', margin: '0 auto' }}>
                    Aggiungi gli ingredienti che hai e troveremo le ricette che puoi cucinare adesso.
                </p>
            </div>

            <div className="search-container">
                <div className="input-wrapper">
                    <input
                        type="text"
                        placeholder="Cerca ingredienti... (es. pollo, pasta, pomodoro)"
                        value={inputValue}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        className="ingredient-input"
                    />
                    {suggestions.length > 0 && (
                        <ul className="suggestions-list">
                            {suggestions.map((suggestion) => (
                                <li key={suggestion} onClick={() => addIngredient(suggestion)}>
                                    {suggestion} <Plus size={16} />
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="selected-ingredients">
                    {selectedIngredients.map((ingredient) => (
                        <div key={ingredient} className="tag animate-fade-up">
                            {ingredient}
                            <button onClick={() => removeIngredient(ingredient)} className="tag-remove" aria-label="Remove">
                                <X size={14} />
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {excludedIngredients.length > 0 && !isPending && (
                <div className="exclusions-bar">
                    <span>{excludedIngredients.length} ingredient{excludedIngredients.length === 1 ? 'e escluso' : 'i esclusi'}</span>
                    <button
                        className="clear-exclusions"
                        onClick={() => {
                            setExcludedIngredients([]);
                            runSearch(selectedIngredients, []);
                        }}
                    >
                        Rimuovi tutte le esclusioni ×
                    </button>
                </div>
            )}

            <div className="results-container">
                {isPending ? (
                    <div className="loading-state flex-center">
                        <Loader2 className="spinner" size={48} />
                        <p className="heading-3 mt-4">Cerco le ricette perfette...</p>
                    </div>
                ) : recipes.length > 0 ? (
                    <div className="results-grid animate-fade-up delay-100">
                        <p className="results-count text-muted">
                            <strong>{recipes.length}</strong> {recipes.length === 1 ? 'ricetta trovata' : 'ricette trovate'}
                            {excludedIngredients.length > 0 && ` · ${excludedIngredients.length} ingredienti esclusi`}
                        </p>
                        <div className="grid-auto-fit">
                            {recipes.map((recipe) => (
                                <FridgeRecipeCard
                                    key={recipe.id}
                                    recipe={recipe}
                                    excludedIngredients={excludedIngredients}
                                    onToggleExclusion={toggleExclusion}
                                />
                            ))}
                        </div>
                    </div>
                ) : selectedIngredients.length > 0 ? (
                    <div className="empty-state">
                        <p className="heading-3">Nessuna ricetta corrispondente trovata.</p>
                        <p className="text-muted">Prova ad aggiungere ingredienti diversi o a rimuovere alcune esclusioni.</p>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
