# 🍽️ Piatto

Ricettario personale basato sulle ricette HelloFresh italiane (fonte: [hfresh.info](https://hfresh.info/it-IT)).

Sfoglia per cucina, cerca per quello che hai in frigo (**Svuota Frigo**), aggiungi ricette alla lista della spesa ed esportala con gli ingredienti sommati.

![Next.js](https://img.shields.io/badge/Next.js-15-black)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED)

---

## Struttura del progetto

```
├── docker-compose.yml          avvia tutto
├── .env.example                template variabili d'ambiente
├── scraper/                    pipeline dati (Python)
│   ├── scraper.py              scarica le ricette da hfresh.info → PostgreSQL
│   ├── normalize_ingredients.py normalizza i nomi ingredienti con un LLM
│   ├── schema.sql              schema del database (applicato automaticamente)
│   ├── Dockerfile
│   └── requirements.txt
└── web/                        app Next.js
    ├── Dockerfile
    ├── next.config.ts
    └── src/
```

---

## Prerequisiti

| Strumento | Versione minima |
|-----------|----------------|
| Docker + Docker Compose | 24+ |
| API LLM compatibile OpenAI | solo per la normalizzazione ingredienti |

Per la normalizzazione ingredienti puoi usare (tutti gratuiti/locali):
- **[LM Studio](https://lmstudio.ai/)** — interfaccia desktop per modelli locali
- **[Ollama](https://ollama.com/)** — modelli locali da terminale
- **OpenAI API** — se preferisci usare GPT

---

## Avvio rapido

### 1. Clona e configura

```bash
git clone https://github.com/sypher01/Piatto.git
cd Piatto
cp .env.example .env
```

Apri `.env` e imposta almeno la password del database:

```env
POSTGRES_PASSWORD=una-password-sicura
```

### 2. Avvia database e app web

```bash
docker compose up -d
```

Attendi circa 10 secondi per l'inizializzazione di PostgreSQL, poi apri:

```
http://localhost:3006
```

Il sito sarà vuoto finché non esegui lo scraper.

---

## Popolamento del database (scraping)

### Prima esecuzione — circa 30–60 minuti

```bash
docker compose run --rm --profile tools scraper
```

Lo scraper:
- Scopre tutti gli URL ricette dalla sitemap di hfresh.info (6 700+ ricette)
- Analizza ogni pagina e inserisce le ricette in PostgreSQL
- **Salva ogni ricetta singolarmente** → puoi usare il sito mentre lo scraper è ancora in esecuzione
- È sicuro rieseguirlo: i duplicati vengono aggiornati, non duplicati

Puoi monitorare i progressi con:

```bash
docker compose exec postgres \
  psql -U hfresh_user -d hfresh_recipes -c "SELECT COUNT(*) FROM recipes;"
```

---

## Normalizzazione ingredienti con LLM

Questo passaggio trasforma i nomi ingredienti grezzi in nomi puliti adatti alla ricerca nel frigo
(es. `"petto di pollo 100% italiano dop"` → `"petto di pollo"`).

**Funziona con qualsiasi API compatibile OpenAI.**

### Configura il tuo LLM in `.env`

**LM Studio (default — gira sul tuo PC):**
```env
LLM_BASE_URL=http://localhost:1234/v1
# LLM_MODEL si auto-rileva
```

**Ollama:**
```env
LLM_BASE_URL=http://localhost:11434/v1
LLM_MODEL=llama3.1
```

**OpenAI:**
```env
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini
```

### Esegui la normalizzazione

```bash
docker compose run --rm --profile tools normalizer
```

- La prima esecuzione processa tutti i nomi univoci (~800–1 200 nomi)
- I mapping vengono salvati nella tabella `ingredient_mappings` del database — **non vengono mai persi**
- Le esecuzioni successive con `--new-only` processano solo i nuovi nomi
- Il processo è riprendibile: se si interrompe, basta rieseguirlo

### Anteprima senza modifiche al database

```bash
docker compose run --rm --profile tools normalizer \
  python normalize_ingredients.py --test
```

---

## Aggiornamento delle ricette

Per aggiornare il database con le ricette pubblicate di recente:

```bash
# 1. Aggiorna le ricette
docker compose run --rm --profile tools scraper

# 2. Normalizza solo i nuovi ingredienti
docker compose run --rm --profile tools normalizer
```

---

## Variabili d'ambiente

| Variabile | Default | Descrizione |
|-----------|---------|-------------|
| `POSTGRES_PASSWORD` | *obbligatoria* | Password PostgreSQL |
| `POSTGRES_DB` | `hfresh_recipes` | Nome del database |
| `POSTGRES_USER` | `hfresh_user` | Utente del database |
| `WEB_PORT` | `3006` | Porta host per l'app web |
| `LLM_BASE_URL` | `http://localhost:1234/v1` | URL base API LLM |
| `LLM_MODEL` | *auto-rilevato* | Nome del modello LLM |

---

## Comandi utili

```bash
# Avvia tutto
docker compose up -d

# Ferma tutto
docker compose down

# Vedi i log dell'app web
docker compose logs -f web

# Accedi al database direttamente
docker compose exec postgres psql -U hfresh_user -d hfresh_recipes

# Resetta completamente (elimina TUTTI i dati)
docker compose down -v
```

---

## Stack tecnologico

| Componente | Tecnologia |
|-----------|-----------|
| App web | Next.js 15 (App Router, Server Components, Server Actions) |
| Database | PostgreSQL 16 |
| Scraper | Python 3.12, requests, BeautifulSoup4 |
| Normalizer | Qualsiasi API compatibile OpenAI (LM Studio, Ollama, OpenAI) |
| Stile | CSS personalizzato (design system glassmorphism) |

---

## Note legali

Le ricette sono di proprietà di HelloFresh e disponibili pubblicamente su [hfresh.info](https://hfresh.info/it-IT). Questo progetto è solo per uso personale.
