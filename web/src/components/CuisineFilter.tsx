import React from 'react';
import Link from 'next/link';
import './CuisineFilter.css';

interface Cuisine {
    id: number;
    name: string;
}

interface Props {
    cuisines: Cuisine[];
    activeCuisineId: number | null;
}

export default function CuisineFilter({ cuisines, activeCuisineId }: Props) {
    if (cuisines.length === 0) return null;

    return (
        <div className="cuisine-filter">
            <Link
                href="/#recipes"
                className={`cuisine-pill ${activeCuisineId === null ? 'active' : ''}`}
            >
                Tutte
            </Link>
            {cuisines.map((c) => (
                <Link
                    key={c.id}
                    href={`/?cuisine=${c.id}#recipes`}
                    className={`cuisine-pill ${activeCuisineId === c.id ? 'active' : ''}`}
                >
                    {c.name}
                </Link>
            ))}
        </div>
    );
}
