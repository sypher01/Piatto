'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

export interface CartItem {
    id: number;
    title: string;
    slug: string;
    image_url: string | null;
}

interface CartContextValue {
    items: CartItem[];
    addItem: (item: CartItem) => void;
    removeItem: (id: number) => void;
    clearCart: () => void;
    isInCart: (id: number) => boolean;
    count: number;
}

const CartContext = createContext<CartContextValue | null>(null);

const STORAGE_KEY = 'piatto_cart';

export function CartProvider({ children }: { children: React.ReactNode }) {
    const [items, setItems] = useState<CartItem[]>([]);

    // Hydrate from localStorage on mount
    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) setItems(JSON.parse(stored));
        } catch {
            // ignore parse errors
        }
    }, []);

    // Persist to localStorage on every change
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    }, [items]);

    const addItem = (item: CartItem) => {
        setItems((prev) => prev.find((i) => i.id === item.id) ? prev : [...prev, item]);
    };

    const removeItem = (id: number) => {
        setItems((prev) => prev.filter((i) => i.id !== id));
    };

    const clearCart = () => setItems([]);

    const isInCart = (id: number) => items.some((i) => i.id === id);

    return (
        <CartContext.Provider value={{ items, addItem, removeItem, clearCart, isInCart, count: items.length }}>
            {children}
        </CartContext.Provider>
    );
}

export function useCart() {
    const ctx = useContext(CartContext);
    if (!ctx) throw new Error('useCart must be used inside CartProvider');
    return ctx;
}
