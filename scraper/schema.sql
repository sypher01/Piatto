-- =============================================================
-- hfresh_recipes — PostgreSQL Schema
-- Applied automatically by the postgres Docker container on first start.
-- The database and user are created via docker-compose env vars
-- (POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD).
-- =============================================================

-- Categories / tags
CREATE TABLE IF NOT EXISTS categories (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    slug        TEXT UNIQUE
);

-- Cuisine types  (Italian, Asian, Mediterranean, …)
CREATE TABLE IF NOT EXISTS cuisines (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE
);

-- Master recipe table
CREATE TABLE IF NOT EXISTS recipes (
    id              SERIAL PRIMARY KEY,
    title           TEXT NOT NULL,
    slug            TEXT UNIQUE,
    description     TEXT,
    difficulty      TEXT,           -- e.g. 'Easy', 'Medium', 'Hard'
    prep_time_min   INTEGER,        -- minutes
    cook_time_min   INTEGER,        -- minutes
    total_time_min  INTEGER,        -- minutes
    servings        INTEGER,
    image_url       TEXT,
    source_url      TEXT NOT NULL UNIQUE,
    cuisine_id      INTEGER REFERENCES cuisines(id),
    scraped_at      TIMESTAMPTZ DEFAULT NOW(),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Recipe <-> Category (many-to-many)
CREATE TABLE IF NOT EXISTS recipe_categories (
    recipe_id   INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (recipe_id, category_id)
);

-- Ingredients
CREATE TABLE IF NOT EXISTS ingredients (
    id              SERIAL PRIMARY KEY,
    recipe_id       INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    name            TEXT NOT NULL,
    canonical_name  TEXT,       -- normalized/lowercased name for fridge-matching queries
    amount          NUMERIC(10,3),
    unit            TEXT,
    notes           TEXT        -- e.g. "finely chopped", "room temperature"
);

-- Instructions / steps
CREATE TABLE IF NOT EXISTS steps (
    id          SERIAL PRIMARY KEY,
    recipe_id   INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    step_number INTEGER NOT NULL,
    title       TEXT,
    body        TEXT NOT NULL,
    image_url   TEXT,
    UNIQUE (recipe_id, step_number)
);

-- Nutritional info (per serving)
CREATE TABLE IF NOT EXISTS nutrition (
    id              SERIAL PRIMARY KEY,
    recipe_id       INTEGER NOT NULL UNIQUE REFERENCES recipes(id) ON DELETE CASCADE,
    calories_kcal   NUMERIC(8,2),
    fat_g           NUMERIC(8,2),
    saturated_fat_g NUMERIC(8,2),
    carbs_g         NUMERIC(8,2),
    sugar_g         NUMERIC(8,2),
    fiber_g         NUMERIC(8,2),
    protein_g       NUMERIC(8,2),
    sodium_mg       NUMERIC(8,2)
);

-- Utensils / tools needed
CREATE TABLE IF NOT EXISTS utensils (
    id      SERIAL PRIMARY KEY,
    name    TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS recipe_utensils (
    recipe_id   INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    utensil_id  INTEGER NOT NULL REFERENCES utensils(id) ON DELETE CASCADE,
    PRIMARY KEY (recipe_id, utensil_id)
);

-- Allergens
CREATE TABLE IF NOT EXISTS allergens (
    id      SERIAL PRIMARY KEY,
    name    TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS recipe_allergens (
    recipe_id   INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    allergen_id INTEGER NOT NULL REFERENCES allergens(id) ON DELETE CASCADE,
    PRIMARY KEY (recipe_id, allergen_id)
);

-- LLM ingredient mapping cache
-- Stores raw canonical_name → LLM-coalesced name so normalisation is never lost
-- and new scrape runs only process genuinely new names.
CREATE TABLE IF NOT EXISTS ingredient_mappings (
    raw_name    TEXT PRIMARY KEY,         -- the name before LLM processing
    mapped_name TEXT NOT NULL,            -- the coalesced name from the LLM
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Handy indexes
CREATE INDEX ON recipes (slug);
CREATE INDEX ON recipes (cuisine_id);
CREATE INDEX ON ingredients (recipe_id);
CREATE INDEX ON ingredients (canonical_name);
CREATE INDEX ON steps (recipe_id);
CREATE INDEX ON ingredient_mappings (mapped_name);

-- Grant schema permissions to the DB owner (resolved at runtime)
GRANT USAGE ON SCHEMA public TO PUBLIC;
GRANT ALL ON ALL TABLES IN SCHEMA public TO PUBLIC;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO PUBLIC;