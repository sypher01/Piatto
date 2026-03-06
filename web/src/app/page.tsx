import React from 'react';
import { getRecentRecipes, getCuisines } from '../lib/queries';
import RecipeCard from '../components/RecipeCard';
import CuisineFilter from '../components/CuisineFilter';
import './page.css';
import Link from 'next/link';
import { ChefHat, Search, Sparkles } from 'lucide-react';

export const revalidate = 3600;

export default async function Home({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const resolvedParams = await searchParams;

  const pageStr = typeof resolvedParams.page === 'string' ? resolvedParams.page : '1';
  const currentPage = parseInt(pageStr, 10) || 1;
  const cuisineStr = typeof resolvedParams.cuisine === 'string' ? resolvedParams.cuisine : undefined;
  const cuisineId = cuisineStr ? parseInt(cuisineStr, 10) || null : null;

  const limit = 12;
  const offset = (currentPage - 1) * limit;

  const [{ recipes: recentRecipes, total }, cuisines] = await Promise.all([
    getRecentRecipes(limit, offset, cuisineId),
    getCuisines(),
  ]);

  const totalPages = Math.ceil(total / limit);

  // Build pagination href preserving cuisine filter
  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    if (cuisineId) params.set('cuisine', String(cuisineId));
    params.set('page', String(p));
    return `/?${params.toString()}#recipes`;
  };

  return (
    <div className="home-container">
      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-background"></div>
        <div className="container hero-content">
          <Link href="/api/random" className="hero-badge animate-fade-up">
            <Sparkles size={16} />
            <span>Scopri il tuo prossimo piatto preferito</span>
          </Link>
          <h1 className="heading-1 animate-fade-up delay-100">
            Cucina Con Quello Che Hai <br />
            <span className="text-gradient">Già Nel Frigo.</span>
          </h1>
          <p className="paragraph-large animate-fade-up delay-200">
            Una raccolta di ricette HelloFresh.
            Trova il piatto perfetto in base a ciò che hai in frigo, oppure sfoglia per cucina.
          </p>
          <div className="hero-actions animate-fade-up delay-300">
            <Link href="/fridge" className="btn btn-primary" style={{ padding: '1rem 2rem', fontSize: '1.1rem' }}>
              <ChefHat size={20} />
              Svuota Frigo
            </Link>
            <Link href="#recipes" className="btn btn-secondary" style={{ padding: '1rem 2rem', fontSize: '1.1rem' }}>
              <Search size={20} />
              Sfoglia Ricette
            </Link>
          </div>
        </div>
      </section>

      {/* Recipe grid */}
      <section id="recipes" className="section-padding container">
        <div className="section-header">
          <h2 className="heading-2">
            {cuisineId
              ? (cuisines.find((c) => c.id === cuisineId)?.name ?? 'Ricette')
              : 'Tutte le Ricette'}
          </h2>
          <p className="text-muted">{total} ricette disponibili</p>
        </div>

        {/* Cuisine filter pills */}
        <CuisineFilter cuisines={cuisines} activeCuisineId={cuisineId} />

        {recentRecipes.length > 0 ? (
          <div className="grid-auto-fit">
            {recentRecipes.map((recipe) => (
              <RecipeCard key={recipe.id} recipe={recipe} />
            ))}
          </div>
        ) : (
          <p className="text-muted" style={{ textAlign: 'center', padding: '4rem 0' }}>
            Nessuna ricetta trovata per questa cucina.
          </p>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="pagination" style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '3rem' }}>
            {currentPage > 1 ? (
              <Link href={pageHref(currentPage - 1)} className="btn btn-secondary">Precedente</Link>
            ) : (
              <button className="btn btn-secondary" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }}>Precedente</button>
            )}
            <span style={{ display: 'flex', alignItems: 'center', fontWeight: 'bold' }}>
              Pagina {currentPage} di {totalPages}
            </span>
            {currentPage < totalPages ? (
              <Link href={pageHref(currentPage + 1)} className="btn btn-secondary">Successiva</Link>
            ) : (
              <button className="btn btn-secondary" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }}>Successiva</button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
