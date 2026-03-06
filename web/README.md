# HFresh Recipes Web App

This is a Next.js (App Router) project providing a modern, premium web interface for the Hello Fresh recipes database.

## Prerequisites

1. **Node.js**: Requires Node 18.17 or later.
2. **Database**: PostgreSQL with the scraped Hello Fresh database. The app expects the database at `192.168.1.210` by default.

## Environment Variables

You can configure the database connection by adding a `.env.local` file in this directory (it will fall back to default values otherwise):

```env
DB_HOST=192.168.1.210
DB_PORT=5432
DB_NAME=hfresh_recipes
DB_USER=hfresh_user
DB_PASSWORD=Hfr3sh!Secure2026
```

## Running the app directly (Node.js)

Since you pulled this on a different environment (`sypher@mini`), make sure you install dependencies first:

```bash
cd sites/recipes_web
npm install
npm run dev
```

*(Note: The `sh: 1: next: not found` error occurs when `node_modules` is missing or hasn't been installed on the current platform.)*

The app is hardcoded via `package.json` to start on **port 3006**.

## Running via Docker

If you prefer to containerize the app and add it to your own `.yml` file, here is a standard Docker setup:

### `Dockerfile`
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3006
CMD ["npm", "start"]
```

### `docker-compose` snippet
```yaml
  recipes_web:
    build: ./sites/recipes_web
    container_name: recipes_web
    restart: unless-stopped
    depends_on:
      - postgres
    environment:
      - DB_HOST=postgres
      - DB_PORT=5432
      - DB_NAME=hfresh_recipes
      - DB_USER=hfresh_user
      - DB_PASSWORD=Hfr3sh!Secure2026
    ports:
      - "3006:3006"
```
