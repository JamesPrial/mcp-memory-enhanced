# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- Build: `npm run build` (runs `tsc` then `chmod +x dist/*.js`)
- Type-check only: `npm run typecheck`
- Lint: `npm run lint` (ESLint flat config in `eslint.config.js`, `eslint . --ext .ts`)
- Test: `npm test` (Vitest). Single file: `npx vitest run test/unit/health-server.test.ts`. By name: `npx vitest run -t "test name"`. Coverage: `npm run test:coverage`.
- Run the server: stdio (default) `node dist/index.js`; HTTP/SSE `npm run start:http` / `npm run start:sse`.

## Architecture

`index.ts` is the entry point and routes by `TRANSPORT_TYPE` (stdio default; http/sse dynamically import `http-server.ts`). `KnowledgeGraphManager` (`knowledge-graph-manager.ts`) holds business logic over a pluggable `IStorageBackend` — `storage/json-storage.ts` (JSONL) or `storage/sqlite-storage.ts` (better-sqlite3) — selected by `storage/factory.ts`. MCP tool definitions live in `server-factory.ts` and `server-factory-schemas.ts`.

## Gotchas

- `STORAGE_TYPE` defaults to `json`. Set `STORAGE_TYPE=sqlite` explicitly to use the performance backend.
- `better-sqlite3` is a native module — local dev needs build tools (Python 3, make, g++); Docker handles this.
- Three tsconfigs: `tsconfig.json` (build), `tsconfig.eslint.json` (lint), `tsconfig.docker.json` (Docker). Edit the right one for the context.

## Testing & CI

- Vitest runs with `globals: true` — `describe`/`it`/`expect` are available without imports.
- CI enforces coverage: **85% lines, 85% functions, 80% branches**. When changing covered files (`storage/**`, `knowledge-graph-manager.ts`, `server-factory.ts`, ...), keep coverage at or above threshold or CI fails.

## Repo etiquette

- `main` is protected — PRs only, never commit directly.
- Branch naming: `feat|fix|chore/VERSION/description` (e.g. `feat/1.0.1/postgres-backend`), based off the current `release/x.x.x` branch. See `BRANCHING.md`.
- Conventional-commit messages (`feat:`, `fix:`, `chore:`).
