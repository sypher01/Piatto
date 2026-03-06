#!/usr/bin/env python3
"""
hfresh.info recipe scraper → PostgreSQL
========================================
Scrapes https://hfresh.info/it-IT and loads all recipes into a
PostgreSQL database on 192.168.1.210.

The site uses Laravel Livewire + Flux UI with Tailwind CSS utility classes.
All content is server-rendered so static scraping works fine.

Requirements:
    pip install requests beautifulsoup4 psycopg2-binary lxml tqdm

Usage:
    python scraper.py
"""

import os
import re
import sys
import json
import time
import logging
import unicodedata
from dataclasses import dataclass, field
from typing import Optional
from urllib.parse import urljoin, urlparse, urlencode

import requests
from bs4 import BeautifulSoup
import psycopg2
from psycopg2.extras import execute_values
from tqdm import tqdm

# ──────────────────────────────────────────────
# CONFIG — override via environment variables
# ──────────────────────────────────────────────
BASE_URL   = "https://hfresh.info/it-IT"
SITE_ROOT  = "https://hfresh.info"

DB_CONFIG = {
    "host":     os.environ.get("DB_HOST", "localhost"),
    "port":     int(os.environ.get("DB_PORT", "5432")),
    "dbname":   os.environ.get("DB_NAME", "hfresh_recipes"),
    "user":     os.environ.get("DB_USER", "hfresh_user"),
    "password": os.environ.get("DB_PASSWORD", ""),
}

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

REQUEST_DELAY  = 0.8   # seconds between requests (be polite)
MAX_RETRIES    = 3
TIMEOUT        = 20

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    handlers=[
        logging.StreamHandler(open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)),
        logging.FileHandler("scraper.log", encoding="utf-8"),
    ],
)
log = logging.getLogger(__name__)


# ──────────────────────────────────────────────
# DATA CLASSES
# ──────────────────────────────────────────────
@dataclass
class Ingredient:
    name:           str
    amount:         Optional[float] = None
    unit:           Optional[str]   = None
    notes:          Optional[str]   = None
    sort_order:     int             = 0
    canonical_name: Optional[str]   = None

@dataclass
class Step:
    step_number: int
    body:        str
    title:       Optional[str] = None
    image_url:   Optional[str] = None

@dataclass
class Nutrition:
    calories_kcal:   Optional[float] = None
    fat_g:           Optional[float] = None
    saturated_fat_g: Optional[float] = None
    carbs_g:         Optional[float] = None
    sugar_g:         Optional[float] = None
    fiber_g:         Optional[float] = None
    protein_g:       Optional[float] = None
    sodium_mg:       Optional[float] = None

@dataclass
class Recipe:
    title:          str
    source_url:     str
    slug:           str                    = ""
    description:    Optional[str]          = None
    difficulty:     Optional[str]          = None
    prep_time_min:  Optional[int]          = None
    cook_time_min:  Optional[int]          = None
    total_time_min: Optional[int]          = None
    servings:       Optional[int]          = None
    image_url:      Optional[str]          = None
    cuisine:        Optional[str]          = None
    categories:     list[str]              = field(default_factory=list)
    allergens:      list[str]              = field(default_factory=list)
    utensils:       list[str]              = field(default_factory=list)
    ingredients:    list[Ingredient]       = field(default_factory=list)
    steps:          list[Step]             = field(default_factory=list)
    nutrition:      Optional[Nutrition]    = None


# ──────────────────────────────────────────────
# HTTP HELPERS
# ──────────────────────────────────────────────
session = requests.Session()
session.headers.update(HEADERS)

def get(url: str, retries: int = MAX_RETRIES) -> Optional[BeautifulSoup]:
    for attempt in range(1, retries + 1):
        try:
            resp = session.get(url, timeout=TIMEOUT)
            if resp.status_code == 200:
                return BeautifulSoup(resp.text, "lxml")
            elif resp.status_code == 404:
                log.warning(f"404 {url}")
                return None
            else:
                log.warning(f"HTTP {resp.status_code} for {url} (attempt {attempt})")
        except requests.RequestException as e:
            log.warning(f"Request error {url}: {e} (attempt {attempt})")
        time.sleep(REQUEST_DELAY * attempt)
    return None


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text)
    text = text.encode("ascii", "ignore").decode("ascii")
    text = text.lower()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_-]+", "-", text)
    return text.strip("-")


def parse_minutes(text: str) -> Optional[int]:
    """Parse strings like '30 min', '1h 15min', '45' into total minutes."""
    if not text:
        return None
    text = text.strip().lower()
    hours   = re.search(r"(\d+)\s*h", text)
    minutes = re.search(r"(\d+)\s*m", text)
    if hours or minutes:
        h = int(hours.group(1)) if hours else 0
        m = int(minutes.group(1)) if minutes else 0
        return h * 60 + m
    only_digits = re.search(r"^(\d+)$", text)
    if only_digits:
        return int(only_digits.group(1))
    return None


def parse_float(text: str) -> Optional[float]:
    if not text:
        return None
    text = str(text).strip().replace(",", ".")
    m = re.search(r"[\d.]+", text)
    return float(m.group()) if m else None


# ──────────────────────────────────────────────
# URL DISCOVERY
# ──────────────────────────────────────────────
def get_recipe_urls_from_sitemap() -> list[str]:
    """Try the it-IT sitemap."""
    urls = []
    sitemap_candidates = [
        f"{SITE_ROOT}/sitemap/it-IT.xml",
        f"{SITE_ROOT}/sitemap.xml",
        f"{SITE_ROOT}/sitemap_index.xml",
        f"{SITE_ROOT}/it-IT/sitemap.xml",
    ]
    for sitemap_url in sitemap_candidates:
        log.info(f"Checking sitemap: {sitemap_url}")
        try:
            resp = session.get(sitemap_url, timeout=TIMEOUT)
        except requests.RequestException as e:
            log.warning(f"Sitemap request failed: {e}")
            continue
        if resp.status_code != 200:
            log.info(f"  → HTTP {resp.status_code}, skipping")
            continue
        soup = BeautifulSoup(resp.text, "lxml-xml")
        # Check if this is a sitemap index (has <sitemap> tags)
        for loc in soup.find_all("sitemap"):
            child_url = loc.find("loc")
            if child_url:
                child_urls = _parse_sitemap_xml(child_url.text.strip())
                urls.extend(child_urls)
        # Also parse as a direct URL list
        direct = _parse_sitemap_soup(soup)
        urls.extend(direct)
        if urls:
            log.info(f"  → Found {len(urls)} recipe URLs")
            break
    return list(set(urls))


def _parse_sitemap_xml(url: str) -> list[str]:
    try:
        resp = session.get(url, timeout=TIMEOUT)
    except requests.RequestException:
        return []
    if resp.status_code != 200:
        return []
    soup = BeautifulSoup(resp.text, "lxml-xml")
    return _parse_sitemap_soup(soup)


def _parse_sitemap_soup(soup) -> list[str]:
    urls = []
    for loc in soup.find_all("url"):
        loc_tag = loc.find("loc")
        if loc_tag:
            u = loc_tag.text.strip()
            if _is_recipe_url(u):
                urls.append(u)
    return urls


def _is_recipe_url(url: str) -> bool:
    """Recipe URLs on hfresh.info follow: /it-IT/recipes/[slug]-[id]"""
    path = urlparse(url).path.lower()
    return "/it-it/recipes/" in path or "/recipes/" in path


def get_recipe_urls_by_crawl() -> list[str]:
    """Crawl paginated listing pages to discover recipe URLs."""
    log.info("Falling back to crawl-based URL discovery …")
    recipe_urls: set[str] = set()

    # Try paginated listing pages: /it-IT?page=N
    page = 1
    consecutive_empty = 0
    while consecutive_empty < 3:
        if page == 1:
            url = BASE_URL
        else:
            url = f"{BASE_URL}?page={page}"
        log.info(f"Crawling listing page {page}: {url}")
        soup = get(url)
        if not soup:
            consecutive_empty += 1
            page += 1
            time.sleep(REQUEST_DELAY)
            continue

        found_on_page = 0
        for a in soup.find_all("a", href=True):
            href = a["href"].strip()
            full = urljoin(SITE_ROOT, href)
            if urlparse(full).netloc != urlparse(SITE_ROOT).netloc:
                continue
            if _is_recipe_url(full) and full not in recipe_urls:
                recipe_urls.add(full)
                found_on_page += 1

        if found_on_page == 0:
            consecutive_empty += 1
        else:
            consecutive_empty = 0

        log.info(f"  → found {found_on_page} new recipes (total: {len(recipe_urls)})")
        time.sleep(REQUEST_DELAY)
        page += 1

        if page > 600:  # safety cap (6720/12 ≈ 560 pages)
            log.warning("Crawl cap reached at 600 pages")
            break

    return list(recipe_urls)


# ──────────────────────────────────────────────
# RECIPE PARSER  (site-specific for hfresh.info)
# ──────────────────────────────────────────────
def parse_recipe(url: str) -> Optional[Recipe]:
    """
    Parse a recipe page from hfresh.info/it-IT.

    The site uses Laravel Livewire + Flux UI. Key structure:
    - data-flux-main : main content wrapper
    - data-flux-heading : section headings
    - data-flux-text : text paragraphs
    - data-flux-card : card containers
    - data-flux-badge : tag/allergen/utensil badges
    """
    soup = get(url)
    if not soup:
        return None
    time.sleep(REQUEST_DELAY)

    main = soup.find(attrs={"data-flux-main": ""})
    if not main:
        # Page might not have rendered content or is a 404 redirect
        log.warning(f"No data-flux-main found at {url}")
        return None

    # ── Title ──────────────────────────────────
    title_el = main.find(attrs={"data-flux-heading": ""})
    if not title_el:
        log.warning(f"No title found at {url}")
        return None
    title = title_el.get_text(strip=True)
    if not title:
        return None

    recipe = Recipe(title=title, source_url=url)
    url_last = urlparse(url).path.rstrip("/").split("/")[-1]
    recipe.slug = slugify(title) or slugify(url_last)

    # ── Subtitle / Description ─────────────────
    # First data-flux-text inside the hero image overlay (within first relative div)
    hero_div = main.find("div", class_=lambda c: c and "relative" in c and "-mx-4" in c)
    if hero_div:
        sub_el = hero_div.find(attrs={"data-flux-text": ""})
        if sub_el:
            recipe.description = sub_el.get_text(strip=True) or None

    # ── Main image ─────────────────────────────
    hero_img = main.find("img", alt=lambda a: a and title[:20] in a if title else False)
    if not hero_img:
        hero_img = main.find("img", class_=lambda c: c and ("h-64" in c or "h-96" in c or "object-cover" in c))
    if hero_img:
        recipe.image_url = hero_img.get("src") or None

    # ── Meta bar: time / difficulty / cuisine ──
    # Structure: flex div containing 2-3 sub-divs, each: <div class="flex items-center gap-2"><svg/><span>value</span></div>
    meta_spans = []
    for div in main.find_all("div", class_=lambda c: c and "flex" in c and "items-center" in c and "gap-2" in c):
        svg = div.find("svg", attrs={"data-flux-icon": ""})
        span = div.find("span")
        if svg and span:
            text = span.get_text(strip=True)
            if text:
                meta_spans.append(text)

    for text in meta_spans:
        tl = text.lower()
        if "min" in tl or re.search(r"\d+\s*h", tl):
            recipe.total_time_min = parse_minutes(text)
        elif "difficoltà" in tl or "difficulty" in tl:
            # "Difficoltà: 1/3" → extract numeric level
            m = re.search(r"(\d+)/(\d+)", text)
            recipe.difficulty = text.strip() if text else None
        elif text and not recipe.cuisine and len(text) < 60:
            # cuisine is the remaining span (after time & difficulty)
            # skip numbers
            if not re.match(r"^\d", text) and "Difficoltà" not in text and "min" not in text.lower():
                recipe.cuisine = text.strip()[:100]

    # ── Servings — extract from Livewire wire:snapshot JSON ──
    # The wire:snapshot is on the main element itself or a child
    wire_el = main if main.has_attr("wire:snapshot") else main.find(attrs={"wire:snapshot": True})
    if wire_el:
        try:
            snapshot = json.loads(wire_el["wire:snapshot"])
            recipe.servings = snapshot.get("data", {}).get("selectedYield")
        except (json.JSONDecodeError, KeyError, TypeError):
            pass

    # ── Allergens / Utensils / Tags ────────────
    # Each section: <p data-flux-text>Label</p> <div class="flex flex-wrap gap-1"><badge>...<badge>...
    section_label_els = main.find_all(
        "p",
        attrs={"data-flux-text": ""},
        string=lambda s: s and s.strip() in ("Allergens", "Utensils", "Tags")
    )
    for label_el in section_label_els:
        label = label_el.get_text(strip=True)
        # The badges are inside the next sibling div
        badge_container = label_el.find_next_sibling("div")
        if not badge_container:
            continue
        badges = [b.get_text(strip=True) for b in badge_container.find_all(attrs={"data-flux-badge": True})]
        if label == "Allergens":
            # First badge is a "may contain traces" disclaimer, not an allergen name
            recipe.allergens = [b for b in badges if b and not b.lower().startswith("può contenere")]
        elif label == "Utensils":
            recipe.utensils = [b for b in badges if b]
        elif label == "Tags":
            recipe.categories = [b for b in badges if b]

    # ── Ingredients ────────────────────────────
    # Inside data-flux-card with "Ingredienti" heading
    ing_card = None
    for card in main.find_all(attrs={"data-flux-card": ""}):
        h = card.find(attrs={"data-flux-heading": ""})
        if h and "ingredienti" in h.get_text(strip=True).lower():
            ing_card = card
            break

    if ing_card:
        # Each ingredient row: div.flex.items-center.gap-3
        for i, row in enumerate(ing_card.find_all("div", class_=lambda c: c and "flex" in c and "items-center" in c and "gap-3" in c)):
            texts = row.find_all("p", attrs={"data-flux-text": ""})
            if len(texts) >= 2:
                name = texts[0].get_text(strip=True)
                qty_raw = texts[-1].get_text(strip=True)
                if not name:
                    continue
                ing = _parse_ingredient(name, qty_raw)
                ing.sort_order = i
                recipe.ingredients.append(ing)
            elif len(texts) == 1:
                name = texts[0].get_text(strip=True)
                if name:
                    recipe.ingredients.append(Ingredient(name=name, sort_order=i))

    # ── Steps ──────────────────────────────────
    # After "Preparation" heading: div.flex.gap-4 with a lime circle containing step number
    prep_heading = None
    for h in main.find_all(attrs={"data-flux-heading": ""}):
        if "preparation" in h.get_text(strip=True).lower() or "preparazion" in h.get_text(strip=True).lower():
            prep_heading = h
            break

    if prep_heading:
        # Steps follow as siblings at the same level as the heading
        parent = prep_heading.parent
        step_num = 0
        for div in parent.find_all("div", class_=lambda c: c and "flex" in c and "gap-4" in c, recursive=False):
            # Check for the lime circle (step number indicator)
            number_circle = div.find("div", class_=lambda c: c and "bg-lime-500" in c)
            if not number_circle:
                continue
            step_num += 1
            content_div = div.find("div", class_=lambda c: c and "flex-1" in c)
            if not content_div:
                continue

            # Collect body text from all <p> elements except the empty label p
            body_parts = []
            step_img_url = None
            for p in content_div.find_all("p", recursive=True):
                text = p.get_text(separator=" ", strip=True)
                if text:
                    body_parts.append(text)
            # Check for step image
            step_img = content_div.find("img")
            if step_img:
                step_img_url = step_img.get("src")
                if step_img_url and not step_img_url.startswith("http"):
                    step_img_url = urljoin(SITE_ROOT, step_img_url)

            body = "\n".join(body_parts).strip()
            if body:
                recipe.steps.append(Step(step_number=step_num, body=body, image_url=step_img_url))

    # ── Nutrition ──────────────────────────────
    # Find "Nutrition" heading then collect the cards that follow
    nutr_heading = None
    for h in main.find_all(attrs={"data-flux-heading": ""}):
        if "nutrition" in h.get_text(strip=True).lower():
            nutr_heading = h
            break

    if nutr_heading:
        # Nutrition cards are in the next sibling grid div
        nutr_grid = nutr_heading.find_next_sibling("div")
        if nutr_grid:
            nutr = Nutrition()
            for card in nutr_grid.find_all(attrs={"data-flux-card": ""}):
                ps = card.find_all("p", attrs={"data-flux-text": ""})
                if len(ps) < 3:
                    continue
                value_text = ps[0].get_text(strip=True)
                unit_text  = ps[1].get_text(strip=True).lower()
                label_text = ps[2].get_text(strip=True).lower()
                val = parse_float(value_text)
                if val is None:
                    continue
                if "kcal" in unit_text or "energia" in label_text and "kj" not in unit_text:
                    if "kj" not in unit_text:
                        nutr.calories_kcal = val
                elif "grassi" in label_text and "satur" not in label_text:
                    nutr.fat_g = val
                elif "satur" in label_text:
                    nutr.saturated_fat_g = val
                elif "carboidrat" in label_text:
                    nutr.carbs_g = val
                elif "zuccher" in label_text:
                    nutr.sugar_g = val
                elif "fibr" in label_text:
                    nutr.fiber_g = val
                elif "protein" in label_text:
                    nutr.protein_g = val
                elif "sodio" in label_text:
                    nutr.sodium_mg = val
            # Only attach if we got at least one value
            if any(v is not None for v in [nutr.calories_kcal, nutr.fat_g, nutr.carbs_g, nutr.protein_g]):
                recipe.nutrition = nutr

    return recipe


def _parse_ingredient(name: str, qty_raw: str) -> Ingredient:
    """
    Parse ingredient quantity string like '150 g', '2 pacchetto', '1 pezzo(i)', 'q.b.'
    Returns an Ingredient with name set, and amount/unit populated where possible.
    """
    qty_raw = qty_raw.strip()
    canon = make_canonical(name)
    if not qty_raw or qty_raw.lower() in ("q.b.", "q. b.", "qb", "to taste"):
        return Ingredient(name=name, canonical_name=canon, notes=qty_raw if qty_raw else None)

    # Match: number + optional unit
    m = re.match(r"^([\d.,/]+)\s*(.*)$", qty_raw)
    if m:
        amount = parse_float(m.group(1))
        unit = m.group(2).strip() or None
        # Clean up unit: remove parenthetical like "pezzo(i)"
        if unit:
            unit = re.sub(r"\([^)]*\)", "", unit).strip()
            if not unit:
                unit = None
        return Ingredient(name=name, canonical_name=canon, amount=amount, unit=unit)

    return Ingredient(name=name, canonical_name=canon, notes=qty_raw)





# Qualifiers stripped when building canonical_name
_QUAL_PATTERNS = [
    r"\b100%\s*italiano\b",
    r"\b100%\s*italiane?\b",
    r"\bitaliano\b",
    r"\bitaliane?\b",
    r"\bdisossate?\b",
    r"\bsenza\s+pelle\b",
    r"\ba\s+fette\b",
    r"\btropicali?\b",
    r"\bfreschi?\b",
    r"\bsecchi?\b",
    r"\bmacinato\b",
    r"\bfino\b",
    r"\bigp\b",
    r"\bdop\b",
    r"\bpgp\b",
    r"\bigt\b",
    r"\bd\.o\.p\.\b",
    r"\bi\.g\.p\.\b",
]
_QUAL_RE = re.compile("|".join(_QUAL_PATTERNS), re.IGNORECASE)

# Normalise "Olio di oliva" / "Olio d'oliva" → "olio d'oliva"
_OIL_RE = re.compile(r"\bolio\s+di\s+oliva\b", re.IGNORECASE)


def make_canonical(name: str) -> str:
    """
    Lightweight normalisation so the LLM pass has cleaner input.
    Full coalescing (e.g. 'petto di pollo' → 'pollo') is left to the LLM.
    """
    s = _OIL_RE.sub("olio d'oliva", name)
    s = _QUAL_RE.sub("", s)
    # collapse extra spaces
    s = re.sub(r"\s{2,}", " ", s).strip(" ,")
    return s.lower()


# ──────────────────────────────────────────────
# DATABASE LAYER
# ──────────────────────────────────────────────
def get_connection():
    return psycopg2.connect(**DB_CONFIG)


def upsert_recipe(conn, recipe: Recipe) -> Optional[int]:
    """
    Insert or update a recipe and all related data.
    Returns recipe.id, or None if the recipe was skipped as a duplicate.
    Same recipe can appear under multiple URLs on hfresh.info; we keep only the first.
    """
    with conn.cursor() as cur:
        # ── Check for duplicate by slug (same recipe, different URL) ──
        cur.execute("SELECT id FROM recipes WHERE slug = %s", (recipe.slug,))
        existing = cur.fetchone()
        if existing:
            # A recipe with this title already exists under a different URL → skip
            log.debug(f"Skipping duplicate slug '{recipe.slug}' for {recipe.source_url}")
            return None

        # ── Cuisine ──────────────────────────
        cuisine_id = None
        if recipe.cuisine:
            cur.execute(
                "INSERT INTO cuisines (name) VALUES (%s) ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING id",
                (recipe.cuisine,)
            )
            cuisine_id = cur.fetchone()[0]

        # ── Recipe ───────────────────────────
        cur.execute("""
            INSERT INTO recipes
                (title, slug, description, difficulty,
                 prep_time_min, cook_time_min, total_time_min,
                 servings, image_url, source_url, cuisine_id, scraped_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW())
            ON CONFLICT (source_url) DO UPDATE SET
                title          = EXCLUDED.title,
                slug           = EXCLUDED.slug,
                description    = EXCLUDED.description,
                difficulty     = EXCLUDED.difficulty,
                prep_time_min  = EXCLUDED.prep_time_min,
                cook_time_min  = EXCLUDED.cook_time_min,
                total_time_min = EXCLUDED.total_time_min,
                servings       = EXCLUDED.servings,
                image_url      = EXCLUDED.image_url,
                cuisine_id     = EXCLUDED.cuisine_id,
                scraped_at     = NOW()
            RETURNING id
        """, (
            recipe.title, recipe.slug, recipe.description, recipe.difficulty,
            recipe.prep_time_min, recipe.cook_time_min, recipe.total_time_min,
            recipe.servings, recipe.image_url, recipe.source_url, cuisine_id,
        ))
        recipe_id = cur.fetchone()[0]

        # ── Categories / Tags ─────────────────
        cur.execute("DELETE FROM recipe_categories WHERE recipe_id = %s", (recipe_id,))
        for cat in recipe.categories:
            cur.execute(
                "INSERT INTO categories (name, slug) VALUES (%s,%s) ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING id",
                (cat, slugify(cat))
            )
            cat_id = cur.fetchone()[0]
            cur.execute(
                "INSERT INTO recipe_categories (recipe_id, category_id) VALUES (%s,%s) ON CONFLICT DO NOTHING",
                (recipe_id, cat_id)
            )

        # ── Allergens ────────────────────────
        cur.execute("DELETE FROM recipe_allergens WHERE recipe_id = %s", (recipe_id,))
        for alg in recipe.allergens:
            cur.execute(
                "INSERT INTO allergens (name) VALUES (%s) ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING id",
                (alg,)
            )
            alg_id = cur.fetchone()[0]
            cur.execute(
                "INSERT INTO recipe_allergens (recipe_id, allergen_id) VALUES (%s,%s) ON CONFLICT DO NOTHING",
                (recipe_id, alg_id)
            )

        # ── Utensils ─────────────────────────
        cur.execute("DELETE FROM recipe_utensils WHERE recipe_id = %s", (recipe_id,))
        for uts in recipe.utensils:
            cur.execute(
                "INSERT INTO utensils (name) VALUES (%s) ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING id",
                (uts,)
            )
            uts_id = cur.fetchone()[0]
            cur.execute(
                "INSERT INTO recipe_utensils (recipe_id, utensil_id) VALUES (%s,%s) ON CONFLICT DO NOTHING",
                (recipe_id, uts_id)
            )

        # ── Ingredients ──────────────────────
        cur.execute("DELETE FROM ingredients WHERE recipe_id = %s", (recipe_id,))
        if recipe.ingredients:
            execute_values(cur, """
                INSERT INTO ingredients (recipe_id, sort_order, name, canonical_name, amount, unit, notes)
                VALUES %s
            """, [
                (recipe_id, ing.sort_order, ing.name, ing.canonical_name, ing.amount, ing.unit, ing.notes)
                for ing in recipe.ingredients
            ])

        # ── Steps ─────────────────────────────
        cur.execute("DELETE FROM steps WHERE recipe_id = %s", (recipe_id,))
        if recipe.steps:
            execute_values(cur, """
                INSERT INTO steps (recipe_id, step_number, title, body, image_url)
                VALUES %s
            """, [
                (recipe_id, s.step_number, s.title, s.body, s.image_url)
                for s in recipe.steps
            ])

        # ── Nutrition ────────────────────────
        if recipe.nutrition:
            n = recipe.nutrition
            cur.execute("""
                INSERT INTO nutrition
                    (recipe_id, calories_kcal, fat_g, saturated_fat_g,
                     carbs_g, sugar_g, fiber_g, protein_g, sodium_mg)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (recipe_id) DO UPDATE SET
                    calories_kcal   = EXCLUDED.calories_kcal,
                    fat_g           = EXCLUDED.fat_g,
                    saturated_fat_g = EXCLUDED.saturated_fat_g,
                    carbs_g         = EXCLUDED.carbs_g,
                    sugar_g         = EXCLUDED.sugar_g,
                    fiber_g         = EXCLUDED.fiber_g,
                    protein_g       = EXCLUDED.protein_g,
                    sodium_mg       = EXCLUDED.sodium_mg
            """, (
                recipe_id, n.calories_kcal, n.fat_g, n.saturated_fat_g,
                n.carbs_g, n.sugar_g, n.fiber_g, n.protein_g, n.sodium_mg,
            ))

    conn.commit()
    return recipe_id


# ──────────────────────────────────────────────
# MAIN
# ──────────────────────────────────────────────
def main():
    log.info("=== hfresh.info recipe scraper starting ===")

    # Test DB connection first
    log.info(f"Connecting to PostgreSQL at {DB_CONFIG['host']} …")
    try:
        conn = get_connection()
        conn.close()
        log.info("✓ Database connection OK")
    except Exception as e:
        log.error(f"Cannot connect to database: {e}")
        sys.exit(1)

    # Discover recipe URLs
    log.info("Step 1 – Discovering recipe URLs …")
    recipe_urls = get_recipe_urls_from_sitemap()
    if recipe_urls:
        log.info(f"✓ Found {len(recipe_urls)} URLs via sitemap")
    else:
        log.info("Sitemap yielded no results, falling back to crawl …")
        recipe_urls = get_recipe_urls_by_crawl()
        log.info(f"✓ Found {len(recipe_urls)} URLs via crawl")

    if not recipe_urls:
        log.error("No recipe URLs found.")
        sys.exit(1)

    # Scrape & import
    log.info(f"Step 2 – Scraping {len(recipe_urls)} recipes …")
    ok = skipped = errors = 0

    conn = get_connection()
    for url in tqdm(recipe_urls, unit="recipe"):
        try:
            recipe = parse_recipe(url)
            if not recipe:
                skipped += 1
                continue
            recipe_id = upsert_recipe(conn, recipe)
            if recipe_id is None:
                skipped += 1  # duplicate slug, already in DB
            else:
                ok += 1
        except Exception as e:
            log.error(f"Failed for {url}: {e}", exc_info=True)
            errors += 1
            try:
                conn.rollback()
            except Exception:
                conn = get_connection()

    conn.close()

    log.info("=" * 50)
    log.info(f"Done! ✓ imported: {ok}  ⚠ skipped: {skipped}  ✗ errors: {errors}")
    log.info("=" * 50)


if __name__ == "__main__":
    main()
