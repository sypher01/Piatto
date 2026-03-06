'use client';

import React, { useState, useEffect, useTransition } from 'react';
import Link from 'next/link';
import { ShoppingCart, Trash2, Download, Copy, Check, UtensilsCrossed, ArrowLeft } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { getIngredientsForCart } from '../../lib/actions';
import type { Ingredient } from '../../lib/queries';
import './page.css';

interface ShoppingListItem {
    key: string;
    displayName: string;
    totalAmount: number | null;
    unit: string | null;
    count: number;
}

function formatAmount(n: number): string {
    const rounded = Math.round(n * 100) / 100;
    return parseFloat(rounded.toFixed(2)).toString();
}

function aggregateIngredients(ingredients: Ingredient[]): ShoppingListItem[] {
    const map = new Map<string, { items: Ingredient[] }>();

    for (const ing of ingredients) {
        const canonical = (ing.canonical_name || ing.name || '').toLowerCase();
        const unit = (ing.unit || '').toLowerCase().trim();
        const key = `${canonical}||${unit}`;
        if (!map.has(key)) map.set(key, { items: [] });
        map.get(key)!.items.push(ing);
    }

    return Array.from(map.entries())
        .map(([key, { items }]) => {
            const allHaveAmount = items.every((i) => i.amount != null && Number(i.amount) > 0);
            const total = allHaveAmount
                ? items.reduce((sum, i) => sum + Number(i.amount), 0)
                : null;
            return {
                key,
                displayName: items[0].name || items[0].canonical_name,
                totalAmount: total,
                unit: items[0].unit || null,
                count: items.length,
            };
        })
        .sort((a, b) => a.displayName.localeCompare(b.displayName, 'it'));
}

function buildTextList(recipes: { title: string }[], items: ShoppingListItem[]): string {
    const date = new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
    const header = `Lista della Spesa — Piatto\nGenerata il: ${date}\n`;
    const recipeLines = recipes.map((r) => `  • ${r.title}`).join('\n');
    const ingLines = items
        .map((item) => {
            const qty = item.totalAmount != null ? `${formatAmount(item.totalAmount)}${item.unit ? ' ' + item.unit : ''}` : '';
            return `  ☐  ${qty ? qty + '  ' : ''}${item.displayName}`;
        })
        .join('\n');
    return `${header}\nRICETTE:\n${recipeLines}\n\nINGREDIENTI:\n${ingLines}\n`;
}

export default function CartPage() {
    const { items, removeItem, clearCart } = useCart();
    const [shoppingList, setShoppingList] = useState<ShoppingListItem[]>([]);
    const [isPending, startTransition] = useTransition();
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (items.length === 0) {
            setShoppingList([]);
            return;
        }
        startTransition(async () => {
            const ids = items.map((i) => i.id);
            const ingredients = await getIngredientsForCart(ids);
            setShoppingList(aggregateIngredients(ingredients));
        });
    }, [items]);

    const textContent = buildTextList(items, shoppingList);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(textContent);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDownload = () => {
        const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'lista-della-spesa.txt';
        a.click();
        URL.revokeObjectURL(url);
    };

    if (items.length === 0) {
        return (
            <div className="cart-empty">
                <ShoppingCart size={64} opacity={0.2} />
                <h2 className="heading-2">Lista della spesa vuota</h2>
                <p className="text-muted">Aggiungi delle ricette per generare la tua lista della spesa.</p>
                <Link href="/" className="btn btn-primary" style={{ marginTop: '1.5rem' }}>
                    Sfoglia le ricette
                </Link>
            </div>
        );
    }

    return (
        <div className="cart-page container section-padding">
            <div className="cart-header">
                <div>
                    <Link href="/" className="back-link">
                        <ArrowLeft size={16} /> Torna alle ricette
                    </Link>
                    <h1 className="heading-2" style={{ marginTop: '0.5rem' }}>Lista della Spesa</h1>
                    <p className="text-muted">{items.length} {items.length === 1 ? 'ricetta' : 'ricette'} selezionate</p>
                </div>
                <div className="cart-actions">
                    <button className="btn btn-secondary" onClick={handleCopy} title="Copia negli appunti">
                        {copied ? <Check size={16} /> : <Copy size={16} />}
                        {copied ? 'Copiato!' : 'Copia testo'}
                    </button>
                    <button className="btn btn-secondary" onClick={handleDownload} title="Scarica come .txt">
                        <Download size={16} />
                        Scarica .txt
                    </button>
                    <button className="btn btn-secondary cart-clear" onClick={clearCart} title="Svuota la lista">
                        <Trash2 size={16} />
                        Svuota
                    </button>
                </div>
            </div>

            <div className="cart-grid">
                {/* Left: recipe list */}
                <div className="cart-recipes">
                    <h3 className="heading-3 cart-section-title">Ricette</h3>
                    <div className="cart-recipe-list">
                        {items.map((item) => (
                            <div key={item.id} className="cart-recipe-item glass-card">
                                {item.image_url ? (
                                    <img src={item.image_url} alt={item.title} className="cart-recipe-thumb" loading="lazy" />
                                ) : (
                                    <div className="cart-recipe-thumb cart-thumb-placeholder flex-center">
                                        <UtensilsCrossed size={24} opacity={0.2} />
                                    </div>
                                )}
                                <div className="cart-recipe-info">
                                    <Link href={`/recipe/${item.slug}`} className="cart-recipe-title">
                                        {item.title}
                                    </Link>
                                </div>
                                <button
                                    className="cart-remove-btn"
                                    onClick={() => removeItem(item.id)}
                                    title="Rimuovi dalla lista"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right: aggregated shopping list */}
                <div className="cart-shopping-list">
                    <h3 className="heading-3 cart-section-title">Ingredienti</h3>
                    {isPending ? (
                        <p className="text-muted">Calcolo ingredienti...</p>
                    ) : (
                        <ul className="shopping-list">
                            {shoppingList.map((item) => (
                                <li key={item.key} className="shopping-item">
                                    <span className="shopping-check">☐</span>
                                    <span className="shopping-name">{item.displayName}</span>
                                    {item.totalAmount != null && (
                                        <span className="shopping-qty">
                                            {formatAmount(item.totalAmount)}{item.unit ? ' ' + item.unit : ''}
                                            {item.count > 1 && <span className="shopping-summed"> (×{item.count})</span>}
                                        </span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}
