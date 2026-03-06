#!/usr/bin/env python3
"""
normalize_ingredients.py
========================
Uses any OpenAI-compatible LLM API (LM Studio, Ollama, OpenAI, etc.) to
coalesce ingredient canonical_names into base ingredient names optimised for
fridge-matching ("what can I cook?").

The script:
  1. Reads every distinct canonical_name from the ingredients table
  2. Checks ingredient_mappings (DB table) to skip already-processed names
  3. Sends new names in batches to the LLM
  4. Receives a JSON mapping { "original": "coalesced", ... }
  5. Writes coalesced names to ingredient_mappings (persistent cache in DB)
  6. Updates canonical_name in ingredients

Usage:
    python normalize_ingredients.py            # full run
    python normalize_ingredients.py --test     # dry-run: 30 names, no DB writes
    python normalize_ingredients.py --new-only # only names not yet in mapping table
    python normalize_ingredients.py --batch 50 # names per LLM call (default 60)

Environment variables:
    DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
    LLM_BASE_URL   OpenAI-compatible base URL (default: http://localhost:1234/v1)
    LLM_MODEL      Model name (auto-detected from /v1/models if not set)
"""

import argparse
import json
import os
import re
import sys
import time
import logging
from typing import Optional

import requests
import psycopg2
from psycopg2.extras import execute_batch
from tqdm import tqdm

# ── Config ────────────────────────────────────────────────────────────────────
LLM_BASE_URL = os.environ.get("LLM_BASE_URL", "http://localhost:1234/v1")
LLM_MODEL    = os.environ.get("LLM_MODEL", "")   # auto-detected if empty

BATCH_SIZE  = 60      # ingredient names per LLM call
MAX_RETRIES = 3
TIMEOUT     = 120     # seconds; LLM generation can be slow for large batches

DB_CONFIG = {
    "host":     os.environ.get("DB_HOST", "localhost"),
    "port":     int(os.environ.get("DB_PORT", "5432")),
    "dbname":   os.environ.get("DB_NAME", "hfresh_recipes"),
    "user":     os.environ.get("DB_USER", "hfresh_user"),
    "password": os.environ.get("DB_PASSWORD", ""),
}

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    stream=open(sys.stdout.fileno(), mode="w", encoding="utf-8", buffering=1),
)
log = logging.getLogger(__name__)

# ── Prompt ────────────────────────────────────────────────────────────────────
SYSTEM_PROMPT = """Sei un normalizzatore di ingredienti per ricette italiane.
Ti darò una lista JSON di nomi di ingredienti (già parzialmente normalizzati, in minuscolo).
Il tuo compito è pulirli per una app "cosa posso cucinare con quello che ho in frigo?".

OBIETTIVO: l'utente descrive il proprio frigo con nomi semplici.
  Se ha "petto di pollo" in frigo, NON ha necessariamente "cosce di pollo".
  Se ha "parmigiano" in frigo, NON ha necessariamente "mozzarella".
  Quindi i tagli/varietà specifici DEVONO restare distinti.

COSA RIMUOVERE (lascia solo il nome che userebbe un cuoco a casa):
  - Indicatori di origine/qualità senza impatto culinario:
    "100% italiano/a/e", "italiano/a/e", "tropicale/i", "biologico/a"
  - Certificazioni: "dop", "igp", "igt", "bio"
  - Dettagli di lavorazione industriale ridondanti:
    "granulare" (nei brodi) → "brodo vegetale", "brodo di pollo", ecc.
  - Aggettivi di consistenza ovvi: "a pasta dura" per i formaggi da grattugia

COSA MANTENERE (queste differenze contano in frigo):
  - Tagli di carne: "petto di pollo", "cosce di pollo", "lonza", "filetto" restano DISTINTI
  - Specie diverse: "salmone", "branzino", "tonno", "mazzancolle", "gamberi" restano DISTINTI
  - Varietà diverse: "pomodorini" ≠ "pomodoro", "scalogno" ≠ "cipolla"
  - Forma che cambia uso: "grattugiato", "macinato", "tritato" — mantieni se cambia cosa metti nel carrello

REGOLE SPECIALI:
  - Dispensa (sale, pepe, olio d'oliva, aceto, zucchero, farina, burro, latte, uova) → invariati
  - Salse/condimenti (salsa di soia, maionese, senape, mirin) → invariati
  - Formaggi noti (parmigiano, mozzarella, gorgonzola, burrata, pecorino) → mantieni il nome specifico
  - "formaggio a pasta dura grattugiato" → "parmigiano grattugiato"

Formato della risposta — SOLO questo JSON, zero testo extra:
{
  "nome_ingrediente_1": "forma_normalizzata_1",
  "nome_ingrediente_2": "forma_normalizzata_2",
  ...
}

Esempio:
Dati: ["petto di pollo", "brodo granulare vegetale", "miele 100% italiano", "sale"]
Risposta:
{
  "petto di pollo": "petto di pollo",
  "brodo granulare vegetale": "brodo vegetale",
  "miele 100% italiano": "miele",
  "sale": "sale"
}"""

USER_TEMPLATE = "Normalizza questi ingredienti:\n{names_json}\n\nRisposta JSON:"


# ── LLM helpers ───────────────────────────────────────────────────────────────
def detect_model() -> Optional[str]:
    """Return the first loaded model ID from the LLM API, or None."""
    try:
        r = requests.get(f"{LLM_BASE_URL}/models", timeout=5)
        if r.status_code == 200:
            models = r.json().get("data", [])
            if models:
                return models[0]["id"]
    except Exception:
        pass
    return None


def call_llm(names: list[str], model: str) -> Optional[dict[str, str]]:
    """Send a batch of ingredient names to the LLM. Returns original→coalesced or None."""
    names_json = json.dumps(names, ensure_ascii=False)
    payload = {
        "model": model,
        "temperature": 0,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": USER_TEMPLATE.format(names_json=names_json)},
        ],
    }

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            r = requests.post(
                f"{LLM_BASE_URL}/chat/completions",
                json=payload,
                timeout=TIMEOUT,
            )
            r.raise_for_status()
            raw = r.json()["choices"][0]["message"]["content"].strip()
        except Exception as e:
            log.warning(f"LLM request failed (attempt {attempt}): {e}")
            time.sleep(2 * attempt)
            continue

        mapping = _extract_json(raw)
        if mapping is not None:
            missing = [n for n in names if n not in mapping]
            if missing:
                log.warning(f"LLM missing {len(missing)} keys on attempt {attempt}: {missing[:5]} …")
                if len(missing) <= max(3, len(names) // 10):
                    for n in missing:
                        mapping[n] = n
                    return mapping
            else:
                return mapping

        log.warning(f"Could not parse JSON from LLM on attempt {attempt}. Raw:\n{raw[:300]}")
        time.sleep(2 * attempt)

    return None


def _extract_json(text: str) -> Optional[dict]:
    """Pull the first JSON object out of a string (handles markdown fences)."""
    text = re.sub(r"^```(?:json)?\s*", "", text.strip(), flags=re.IGNORECASE)
    text = re.sub(r"\s*```$", "", text.strip())
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if not m:
        return None
    try:
        return json.loads(m.group())
    except json.JSONDecodeError:
        return None


# ── DB helpers ────────────────────────────────────────────────────────────────
def get_distinct_canonicals(conn) -> list[str]:
    """Return every distinct canonical_name from the ingredients table."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT DISTINCT COALESCE(canonical_name, lower(name))
            FROM ingredients
            ORDER BY 1
        """)
        return [row[0] for row in cur.fetchall() if row[0]]


def load_existing_mappings(conn) -> dict[str, str]:
    """Load all previously processed mappings from the ingredient_mappings table."""
    with conn.cursor() as cur:
        cur.execute("SELECT raw_name, mapped_name FROM ingredient_mappings")
        return {row[0]: row[1] for row in cur.fetchall()}


def save_mappings(conn, mapping: dict[str, str]) -> None:
    """Persist LLM mappings to ingredient_mappings table (upsert, idempotent)."""
    pairs = list(mapping.items())
    if not pairs:
        return
    with conn.cursor() as cur:
        execute_batch(
            cur,
            """
            INSERT INTO ingredient_mappings (raw_name, mapped_name)
            VALUES (%s, %s)
            ON CONFLICT (raw_name) DO UPDATE SET mapped_name = EXCLUDED.mapped_name
            """,
            pairs,
            page_size=200,
        )
    conn.commit()


def apply_mapping(conn, mapping: dict[str, str]) -> int:
    """Update canonical_name in ingredients for changed names. Returns update count."""
    pairs = [(v, k) for k, v in mapping.items() if k != v]
    if not pairs:
        return 0
    with conn.cursor() as cur:
        execute_batch(
            cur,
            """
            UPDATE ingredients
               SET canonical_name = %s
             WHERE canonical_name = %s
                OR (canonical_name IS NULL AND lower(name) = %s)
            """,
            [(new, old, old) for new, old in pairs],
            page_size=200,
        )
    conn.commit()
    return len(pairs)


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Normalise ingredient canonical_names via LLM.")
    parser.add_argument("--test",     action="store_true", help="Dry-run: 30 names, no DB writes")
    parser.add_argument("--new-only", action="store_true", help="Only process names not yet in ingredient_mappings")
    parser.add_argument("--batch", type=int, default=BATCH_SIZE, help=f"Names per LLM call (default {BATCH_SIZE})")
    args = parser.parse_args()

    # ── Detect model ──────────────────────────────────────────────────────────
    log.info(f"Connecting to LLM API at {LLM_BASE_URL} …")
    model = LLM_MODEL or detect_model()
    if not model:
        log.error("Could not detect a model. Set LLM_MODEL env var or ensure the API has a loaded model.")
        sys.exit(1)
    log.info(f"Using model: {model}")

    # ── Connect to DB ─────────────────────────────────────────────────────────
    log.info("Connecting to PostgreSQL …")
    try:
        conn = psycopg2.connect(**DB_CONFIG)
    except Exception as e:
        log.error(f"DB connection failed: {e}")
        sys.exit(1)
    log.info("✓ DB connection OK")

    # ── Load existing mappings from DB ────────────────────────────────────────
    existing_mappings = load_existing_mappings(conn)
    log.info(f"Loaded {len(existing_mappings)} existing mappings from ingredient_mappings table")

    all_names = get_distinct_canonicals(conn)
    log.info(f"Found {len(all_names)} distinct canonical names in DB")

    if args.new_only and not args.test:
        all_names = [n for n in all_names if n not in existing_mappings]
        log.info(f"After --new-only filter: {len(all_names)} names to process")

    if not all_names:
        log.info("Nothing to do.")
        conn.close()
        return

    if args.test:
        n = len(all_names)
        sample = all_names[:10] + all_names[n//2 - 5: n//2 + 5] + all_names[-10:]
        sample = list(dict.fromkeys(sample))[:30]
        log.info(f"[TEST MODE] Running on {len(sample)} names — no DB writes")
        log.info(f"Sample: {sample}")
        mapping = call_llm(sample, model)
        if mapping:
            print("\n=== LLM mapping result ===")
            for orig, coalesced in sorted(mapping.items()):
                marker = "  (changed)" if orig != coalesced else ""
                print(f"  {orig!r:50s} -> {coalesced!r}{marker}")
            changed = sum(1 for k, v in mapping.items() if k != v)
            print(f"\n{changed}/{len(sample)} names would be changed.")
        else:
            log.error("LLM returned no usable mapping.")
        conn.close()
        return

    # ── Full run ──────────────────────────────────────────────────────────────
    batches = [all_names[i:i + args.batch] for i in range(0, len(all_names), args.batch)]
    log.info(f"Processing {len(batches)} batches of up to {args.batch} names each …")

    total_changed = 0
    total_errors  = 0

    for batch in tqdm(batches, unit="batch"):
        mapping = call_llm(batch, model)
        if mapping is None:
            log.error(f"Batch failed after {MAX_RETRIES} retries, skipping: {batch[:3]} …")
            total_errors += 1
            continue

        # Persist to DB first (survives restarts/crashes mid-run)
        save_mappings(conn, mapping)
        changed = apply_mapping(conn, mapping)
        total_changed += changed

    conn.close()
    log.info("=" * 50)
    log.info(f"Done! {total_changed} names updated, {total_errors} batches failed")
    log.info("Tip: run with --new-only after the scraper to process only new ingredients.")
    log.info("=" * 50)


if __name__ == "__main__":
    main()
