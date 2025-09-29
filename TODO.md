# Beam Lite MVP TODO

## Cross-Cutting
- [x] Settle on supported macOS and Chrome versions (latest stable +/-2) and document in PRD.
- [ ] Register Cloudflare account/project and create `BEAM_KV` namespace (prod + staging).
- [x] Establish environment config strategy (local `.env`, wrangler secrets, staging/prod workers).
- [x] Define logging/redaction policy and error code conventions.

## Cloudflare Worker (Backend)
- [x] Scaffold TypeScript Worker project (`wrangler init`) under `/worker`.
- [x] Configure `wrangler.toml` with KV binding, environments, and compatibility date.
- [x] Implement `POST /v1/devices` handler: validate payload, hash inbox key, store subscription + metadata.
- [x] Implement `POST /v1/inbox/:deviceId`: auth header, create `itemId`, persist `{ itemId, deviceId, url, sentAt }` in KV with 7-day TTL, enqueue push payload.
- [ ] Hand-roll VAPID signing & payload encryption using Workers `crypto.subtle` (no Node deps).
- [x] Implement `GET /v1/devices/:deviceId/pending`: auth header, list pending items ordered by enqueue time.
- [x] Implement `POST /v1/items/:itemId/ack`: auth header, delete KV entry, optionally track receipt timestamp.
- [x] Implement `POST /v1/devices/:deviceId/rotate-key`: validate old key, update hash, allow subscription refresh.
- [x] Add Cloudflare Rules-based rate limiting (10 req/min per IP + device) with KV fallback inside Worker.
- [x] Add lightweight logging with header redaction and structured error responses.
- [x] Write unit/integration tests (covering auth, persistence, ACK, rotate).

## Chrome Extension (Receiver)
- [ ] Scaffold MV3 project under `/extension` with TypeScript tooling.
- [ ] Implement service worker: install flow (generate deviceId/inboxKey, subscribe to push, call `/v1/devices`).
- [ ] Implement push handler: dedupe (60s window via `chrome.storage.local`), open tab respecting 3 tabs/sec cap, call ACK endpoint.
- [ ] Implement startup handler: fetch pending queue, open sequentially with storm control, ACK each.
- [ ] Add optional alarm to poll pending queue (5 min) and ensure it respects rate limits.
- [ ] Build options page: display/edit device name, show deviceId, autoOpen toggle, QR + copy JSON, rotate key button.
- [ ] Provide pairing blob generation & QR (e.g., canvas/QrCode library) updated on rotation.
- [ ] Implement rotate-key flow (call Worker, update local storage, refresh blob/QR).
- [ ] Add lightweight popup (optional) showing last 20 opens and autoOpen toggle.
- [ ] Write unit tests (Jest/Vitest) for utility modules and integration tests via Chrome extension test harness.

## Apple Shortcuts (Sender)
- [ ] Build **Add Beam Device** shortcut: QR scan & paste paths, validation, dedupe by deviceId, save to `BeamDevices.json` in iCloud Drive.
- [ ] Build **Send to Beam** share sheet shortcut: load devices, handle "All Desktops", POST with `sentAt`, notify success, show alert on 401 to re-pair.
- [ ] Build per-device shortcuts (MacBook, Studio Desktop) with hard-coded endpoints and notifications.
- [ ] Document installation/export steps and shareable links for each Shortcut.
- [ ] Test on physical iPhone/iPad to confirm file permissions and iCloud sync behavior.

## Reliability & Ops
- [ ] Configure 7-day TTL on KV writes and verify deletion on ACK.
- [ ] Instrument metrics: enqueue count, push success/failure, pending size, ack latency.
- [ ] Set up alerting/monitoring (Cloudflare Analytics or external) for rate limit breaches and failed pushes.
- [ ] Draft runbook covering re-pair flow, key rotation, and failure recovery.

## QA & Launch
- [ ] Create end-to-end test plan covering: first pair (QR/paste), share while Chrome open, share while Chrome asleep, multiple device fan-out, key rotation, 401 re-pair alert.
- [ ] Perform internal dogfood with two desktop Chrome installs and at least one iOS device.
- [ ] Iterate on UX copy/notifications based on dogfood feedback.
- [ ] Finalize README with install steps and publish Shortcut share links.
