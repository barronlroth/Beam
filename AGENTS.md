# Repository Guidelines

## Project Structure & Module Organization
- `docs/` holds product and technical specs (`prd-mvp.md`, `tech-design.md`).
- `worker/` contains the Cloudflare Worker source under `src/` plus Vitest tests in `tests/`.
- `extension/` now houses the MV3 extension:
  - `src/serviceWorker.ts` (registration helpers), `src/swRuntime.ts` (install/push logic), `src/sw.ts` (event wiring), and `src/swAlarms.ts` (catch-up scheduling).
  - Tests live in `extension/tests/` and mirror each module.
- `shortcuts/` aggregates iOS Shortcut exports and helper scripts.
- Root-level `TODO.md` tracks MVP milestones; `AGENTS.md` (this file) provides contributor guidance.

## Build, Test, and Development Commands
- `npm install` (run inside `worker/`) installs Worker dependencies.
- `npm run dev` (in `worker/`) launches `wrangler dev` with a local KV store.
- `npm test` (in `worker/`) runs the Vitest integration suite against the Worker entrypoint.
- Future extension tooling will live under `extension/` (scaffold pending); avoid running commands there until documented.

## Coding Style & Naming Conventions
- TypeScript: strict mode, ES modules, prefer descriptive camelCase for functions/variables and PascalCase for types/interfaces.
- Files use two-space indentation; keep ASCII characters unless specs require otherwise.
- Route IDs follow prefixes (`chr_` for devices, `itm_` for pending items); reuse these patterns in new code.

## Testing Guidelines
- Tests use Vitest (run `npm test` in `worker/` or `extension/`). Name files with `.test.ts` and describe scenarios in plain language.
- Follow TDD: add or extend a failing test before implementing new behavior.
- Ensure `npm test` passes before committing; cover error paths (auth failures, rate limits) and extension runtime flows (dedupe, storm control, event wiring).

## Commit & Pull Request Guidelines
- Commits are imperative and scoped (e.g., "Add inbox, pending, and rotate endpoints"). Group related changes with tests.
- Document changes in the PR body: summary, test evidence (`npm test` output), and any follow-up TODOs.
- Reference related issues or TODO checklist items; include screenshots/gifs only for UX-facing changes (extension UI, Shortcuts).

## Security & Configuration Tips
- Never commit real secrets. Store VAPID keys via `wrangler secret` or `.dev.vars` (ignored by Git).
- Replace `<kv-id>` in `worker/wrangler.toml` with environment-specific namespace IDs before deploying.
