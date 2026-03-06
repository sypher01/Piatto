import React from 'react';
import FridgeSaver from '../../components/FridgeSaver';
import { getAllCanonicalIngredients } from '../../lib/queries';

export const metadata = {
    title: 'Svuota Frigo | Piatto',
    description: 'Trova ricette in base agli ingredienti che hai in frigo.',
};

export default async function FridgePage() {
    const ingredients = await getAllCanonicalIngredients();

    return (
        <div className="container" style={{ minHeight: 'calc(100vh - 150px)' }}>
            <FridgeSaver availableIngredients={ingredients} />
        </div>
    );
}
