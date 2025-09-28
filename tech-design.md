# Beam Lite Technical Design

## 1. Purpose & Scope
Beam Lite delivers a zero-friction path from an iOS share action to opening the shared URL on a chosen desktop Chrome instance. This document details the technical design for the MVP: Chrome extension (MV3), iOS Shortcuts, and a Cloudflare Workers backend.

## 2. System Components
- **Chrome Extension (Receiver):** Registers/pairs devices, listens for pushes, opens tabs, performs catch-up, and exposes options UI for key rotation and configuration.
- **Apple Shortcuts (Sender):** Maintains a local registry of paired devices (`BeamDevices.json` in iCloud Drive/Shortcuts), provides Share Sheet action plus per-device shortcuts, and POSTs payloads to the backend.
- **Cloudflare Worker API (Backend):** Authenticates requests using per-device inbox keys, stores pending items in Workers KV, sends Web Push notifications, and exposes endpoints for catch-up and acknowledgements.
- **Workers KV Storage:** Persists pending items and minimal delivery metadata necessary for catch-up and dedupe.

## 3. Pairing Flow
1. **Extension install**
   - Generate `deviceId` (prefix `chr_` + random bytes) and `inboxKey` (128-bit random, base64url encoded).
   - Subscribe to Web Push; obtain `subscription` JSON.
   - POST `/v1/devices` with `{ deviceId, keyHash = SHA-256(inboxKey), subscription, name }`.
2. **Options page** renders pairing blob and QR code:
   ```json
   { "name": "Barron's MacBook Chrome", "deviceId": "chr_8f3c0d", "inboxKey": "<base64url>", "api": "https://api.beam.example" }
   ```
3. **iOS** runs **Add Beam Device** Shortcut:
   - Scan QR or paste JSON.
   - Append device entry to `BeamDevices.json` (Shortcuts/iCloud Drive).
   - Show success notification.

## 4. Send & Deliver Flow
1. User shares a URL via Safari Share Sheet → **Send to Beam** Shortcut.
2. Shortcut loads `BeamDevices.json`, lets the user pick targets (or uses per-device shortcut), and constructs payload `{ url, title?, sentAt = now }`.
3. Shortcut POSTs to `/v1/inbox/{deviceId}` with `X-Inbox-Key: <inboxKey>`.
4. Worker validates key, assigns `itemId`, writes pending record to KV, and sends Web Push payload `{ itemId, url, title?, sentAt }`.
5. Extension service worker receives push →
   - Respects dedupe (skip if recently opened).
   - Opens a new tab (or shows notification if `autoOpen` disabled).
   - Sets `deliveredAt` locally and immediately calls `POST /v1/items/{itemId}/ack` with `X-Inbox-Key`.
6. Worker marks item acknowledged (delete/persist `openedAt`) and stops further delivery.

## 5. Catch-up Flow
- On `chrome.runtime.onStartup` (and optionally via periodic alarm), extension calls `GET /v1/devices/{deviceId}/pending` with `X-Inbox-Key`.
- Worker lists pending KV entries (ordered by `createdAt`).
- Extension opens each URL (respecting storm control), then ACKs each item.
- KV entry deleted (or `deliveredAt`/`openedAt` updated) after ACK.

## 6. Key Rotation
- Options page exposes "Rotate Key".
- Extension generates new `inboxKey`, updates `keyHash`, POSTs `/v1/devices/{deviceId}/rotate-key` with `X-Inbox-Key` (old).
- Backend validates old key, stores new hash, returns success.
- Extension updates pairing blob + QR.
- User must re-run Add Beam Device (or update per-device shortcuts) with the new blob.

## 7. Data Model & Storage
### Workers KV
- **Key format:** `device:{deviceId}:item:{itemId}`.
- **Value:** `{ itemId, deviceId, url, title?, sentAt, createdAt, deliveredAt?, openedAt? }`.
- TTL not used (manual clean-up via ACK).
- Secondary index optional for debugging (e.g., `recent:{deviceId}` with sorted list).

### In-memory / Runtime
- Extension keeps recent URL timestamps for 60s dedupe.
- Shortcut states are purely in `BeamDevices.json`.

## 8. API Surface (MVP)
- `POST /v1/devices`
  - Body `{ deviceId, keyHash, subscription, name }`.
  - Idempotent updates allowed.
- `POST /v1/inbox/:deviceId`
  - Headers: `X-Inbox-Key`.
  - Body `{ url, title?, sentAt?, sourceDeviceName? }`.
  - Response `202` with `{ itemId }` (for logging if needed).
- `GET /v1/devices/:deviceId/pending`
  - Headers: `X-Inbox-Key`.
  - Response `{ items: [...] }`.
- `POST /v1/items/:itemId/ack`
  - Headers: `X-Inbox-Key`.
  - Body optional `{ deliveredAt?, openedAt? }` (extension can omit; server records receipt timestamp).
- `POST /v1/devices/:deviceId/rotate-key`
  - Headers: `X-Inbox-Key` (old).
  - Body `{ keyHash, subscription? }` (allows subscription refresh).

## 9. Chrome Extension Details
- **Manifest:** MV3 with permissions `tabs`, `storage`, `notifications`, `alarms`.
- **Service worker:**
  - Handles install/update, push, alarms, startup.
  - Enforces storm control (max 3 tabs/sec) and dedupe window (60s).
  - Persists delivery metadata in `chrome.storage.local` for quick checks.
- **Options page:** React/Vite or vanilla (small scope). Displays device info, toggles (`autoOpen`, `coalesceBursts`), QR/JSON, rotate key button.
- **Popup (optional):** lightweight history view (reads last 20 items from local storage) and quick toggle.

## 10. Apple Shortcuts Details
- **BeamDevices.json schema:**
  ```json
  [
    { "name": "Barron's MacBook Chrome", "deviceId": "chr_8f3c0d", "inboxKey": "...", "api": "https://api.beam.example" }
  ]
  ```
- **Storage location:** `iCloud Drive/Shortcuts/BeamDevices.json` (auto-created if missing).
- **Add Beam Device:** supports QR scan and manual paste; validates required keys before save.
- **Send to Beam:** Share Sheet only accepts URLs, supports "All Desktops" fan-out, includes `sentAt` timestamp.
- **Per-device shortcuts:** Hard-coded target, same payload structure, optional Quick Actions placement.

## 11. Backend Implementation (Cloudflare Worker)
- **Runtime:** TypeScript module worker (`export default { fetch }`).
- **Dependencies:** `itty-router` (optional), `@cloudflare/kv-asset-handler` not needed, Web Crypto native for SHA-256 & Web Push VAPID.
- **Web Push:** Use `@webpush-libs/webpush`-style logic or hand-rolled util leveraging Workers `crypto.subtle`.
- **Rate limiting:** Basic in-memory token bucket keyed by IP + deviceId (per-request) with fallback KV-based counters if needed.
- **Logging:** Use `console.log` with redaction (never log `X-Inbox-Key`).
- **Error responses:** JSON body `{ error: { code, message } }` with appropriate HTTP status.

## 12. Observability & Reliability
- `wrangler tail` for live logs, plus KV instrumentation counters.
- Metrics: enqueues, push successes/failures, pending queue length, ack latency.
- Alerts: push failure rates, unusually large pending backlog, rate-limit thresholds.

## 13. Security & Privacy
- Transport over HTTPS only (`wrangler` routes enforce).
- Secrets handled client-side; server stores only hashes.
- Rotate keys on demand; expired keys reject requests (HTTP 401).
- Minimal retention: KV entries removed on ACK, no long-term server-side history in MVP.
- Dedupe to prevent tab storms; rate limiting to mitigate abuse.

## 14. Deployment Workflow
1. Develop locally with `wrangler dev` (provides mock KV).
2. Run extension in Chrome dev mode pointing to staging API base.
3. Publish Worker via `wrangler deploy` (environment-specific config via `wrangler.toml`).
4. Bundle extension using `npm run build` and load into Chrome manually for testing.
5. Distribute Shortcuts as `.shortcut` files or via iCloud share links.

## 15. Proposed Monorepo Structure
```
/beam-lite
  /apps
    /chrome-extension      # MV3 source (src/, manifests/, build tooling)
    /shortcuts             # Shortcut exports, documentation, automation scripts
  /services
    /api-worker            # Cloudflare Worker source (TypeScript), wrangler config, KV bindings
  /packages
    /shared-types          # Shared TypeScript types (item payloads, device schemas)
    /shared-utils          # Optional helpers (e.g., schema validation)
  /infrastructure
    /terraform             # Future IaC (placeholder)
    /wrangler              # Environment-specific TOML overlays
  /docs
    prd-mvp.md
    tech-design.md
  package.json             # Workspace root controlling shared tooling
  pnpm-workspace.yaml      # Or npm workspaces; enables shared lint/build
  README.md
```
- Root configured as JS/TS workspace (pnpm or npm) for shared lint/build.
- Each app/service has its own `package.json` and build scripts.
- Docs consolidated under `/docs` for clarity.

## 16. Outstanding Items
- Confirm minimum macOS/Chrome versions to support.
- Decide on alarm polling frequency (default 5 minutes unless performance dictates otherwise).
- Evaluate need for staging vs production workers (two wrangler environments) before launch.

