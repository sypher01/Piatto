'use client';

import React from 'react';
import { ShoppingCart, Check } from 'lucide-react';
import { useCart, type CartItem } from '../context/CartContext';
import './AddToCartButton.css';

interface Props {
    recipe: CartItem;
    variant?: 'icon' | 'full';
}

export default function AddToCartButton({ recipe, variant = 'icon' }: Props) {
    const { addItem, removeItem, isInCart } = useCart();
    const inCart = isInCart(recipe.id);

    const handleClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (inCart) {
            removeItem(recipe.id);
        } else {
            addItem(recipe);
        }
    };

    if (variant === 'full') {
        return (
            <button
                onClick={handleClick}
                className={`add-to-cart-btn-full ${inCart ? 'in-cart' : ''}`}
                title={inCart ? 'Rimuovi dalla lista della spesa' : 'Aggiungi alla lista della spesa'}
            >
                {inCart ? <Check size={18} /> : <ShoppingCart size={18} />}
                {inCart ? 'Nella lista' : 'Aggiungi alla spesa'}
            </button>
        );
    }

    return (
        <button
            onClick={handleClick}
            className={`add-to-cart-btn ${inCart ? 'in-cart' : ''}`}
            title={inCart ? 'Rimuovi dalla lista della spesa' : 'Aggiungi alla lista della spesa'}
        >
            {inCart ? <Check size={16} /> : <ShoppingCart size={16} />}
        </button>
    );
}
