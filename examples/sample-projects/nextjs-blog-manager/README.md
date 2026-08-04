# Next.js Blog Manager

A small, standalone blog management application built with the Next.js App Router. It includes a real page, JSON API routes, local persistence, deterministic seed data, and native Node tests.

## Requirements

- Node.js 20 or newer
- npm 10 or newer

## Run it

```bash
npm install
npm run seed
npm run dev
```

Open [http://localhost:3402](http://localhost:3402). The development server uses port `3402` by default; Next.js also honors the `PORT` environment variable:

```bash
PORT=3412 npm run dev
```

For a production-like run:

```bash
npm test
npm run build
PORT=3412 npm start
```

## Features

- Browse published and draft posts from the home page.
- Create posts at `/posts/new` and edit existing posts.
- Read and write posts through `/api/posts` and `/api/posts/:slug`.
- Check service readiness at `/api/health`.
- Seed the same three posts repeatedly with `npm run seed`.

## Persistence

The committed `data/seed.json` file is the deterministic starting dataset. Runtime writes go to `.data/posts.json`, which is intentionally ignored by version control. Set `BLOG_MANAGER_DATA_DIR` to use another local data directory in tests or an isolated copy.

```bash
BLOG_MANAGER_DATA_DIR=.data npm run seed
```

The seed operation is idempotent: running it again replaces the runtime data with the same ordered records.
