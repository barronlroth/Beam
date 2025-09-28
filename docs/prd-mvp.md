# PRD - Beam Lite (iOS Shortcuts -> Chrome, No-Auth Pairing)

## 1) Problem & Vision
**Problem:** When Barron finds something on iPhone (e.g., a URL in Safari), he wants it to **instantly appear** on a chosen desktop Chrome (MacBook, Studio Desktop, etc.) without needing to remember, copy, or "check later."

**Vision:** A lean cross-device "beam" that opens links on the right Chrome device **now** (or on next startup if the device is asleep). Zero friction, zero heavy auth. Shipping as: **iOS Shortcuts + Chrome Extension + tiny backend**.

---

## 2) Goals & Non-Goals
**Goals (MVP)**
- From iOS Share Sheet, send a URL to a selected Chrome device and **auto-open** it in a new tab.
- Support **multiple Chrome devices** (e.g., MacBook, Studio Desktop) selectable at send time.
- **No traditional user accounts**; devices are paired via a **random inbox key** using QR or paste.
- If Chrome isn't running, URLs open on **next Chrome startup** (catch-up) via pending queue.
- Provide basic **history** and simple **rate-limit/dedupe** to avoid tab storms.

**Non-Goals (MVP)**
- iOS receiving (push to iPhone), images/files, team sharing, granular org controls.
- Full identity (OAuth/Apple/Google) or cross-user sharing.
- Long-term server-side history retention (beyond pending catch-up queue).

---

## 3) User Stories
1. *As an iPhone user*, I can share a page from Safari to **Send to Beam**, pick **MacBook Chrome**, and see the page open there instantly.
2. *As a power user*, I can create separate shortcuts "**Send to MacBook**," "**Send to Studio Desktop**" that skip the device picker for one-tap sending.
3. *As a multi-device user*, I can **pair** each Chrome install once (QR or paste) and see them listed in the Shortcut.
4. *As a reliability-focused user*, if my laptop was asleep, the link appears automatically after I launch Chrome.

---

## 4) Product Scope (MVP)
- **Sender:** iOS Shortcuts (Share Sheet action for URLs; plus optional per-device shortcuts)
- **Receiver:** Chrome Extension (MV3) on macOS (works on any desktop Chrome)
- **Backend:** Tiny HTTPS API + Web Push sender; minimal persistence for pending items and device registry

---

## 5) Architecture Overview
**Pairing model:** Each Chrome installation registers a `deviceId` and generates an `inboxKey` (random 128-bit secret). It also registers a **Web Push subscription (VAPID)** with the backend. The extension displays a **pairing blob** as QR and copyable JSON. The iOS Shortcut ingests that blob and stores it locally in `BeamDevices.json`.

**Send flow:**
1) iOS Shortcut (Share Sheet) constructs `{url, sentAt}` and POSTs to `/v1/inbox/{deviceId}` with header `X-Inbox-Key: <inboxKey>`.
2) Backend validates key (hash compare), assigns an `itemId`, enqueues `{itemId, url, sentAt}`, triggers **Web Push** to that device's subscription.
3) Chrome extension service worker receives `{ itemId, url, sentAt }`, opens the tab, then ACKs using the same `X-Inbox-Key`.

**Catch-up:** On `chrome.runtime.onStartup`, the extension calls `/v1/devices/{deviceId}/pending`, opens any undelivered URLs, then ACKs each with `X-Inbox-Key`.

---

## 6) Data Model (minimal)
**devices**
- `deviceId: string` (e.g., "chr_8f3c0d...")
- `keyHash: string` (hash of inboxKey; raw key never stored)
- `subscription: object` (Web Push subscription JSON)
- `name: string` ("Barron's MacBook Chrome")
- `createdAt, updatedAt: timestamp`

**items**
- `itemId: string`
- `deviceId: string`
- `url: string`
- `sentAt: ts`

KV entries carry a 7-day TTL; ACKs delete entries sooner.

---

## 7) API Surface (draft)
- `POST /v1/devices` -> register/update device
  - Body: `{ deviceId, keyHash, subscription, name }`
- `POST /v1/inbox/:deviceId` -> enqueue + push
  - Headers: `X-Inbox-Key: <rawKey>` (server hashes and compares to `keyHash`)
  - Body: `{ url, sentAt? }`
  - Responses: `202` on accepted
- `GET /v1/devices/:deviceId/pending` -> list undelivered items
- `POST /v1/items/:itemId/ack` -> acknowledge delivery
  - Headers: `X-Inbox-Key: <rawKey>` (required)
- `POST /v1/devices/:deviceId/rotate-key` -> generate & return new keyHash (extension generates new raw key locally)

**Security**
- Only header-based secret accepted; reject if absent.
- Rate-limit `/v1/inbox/*` by IP and by deviceId.
- CORS locked down to Shortcuts isn't necessary (native client), but keep tight defaults.

---

## 8) Chrome Extension - Requirements (MV3)
**Permissions**
- `"tabs"`, `"storage"`, `"notifications"`, `"alarms"`

**Service Worker Behavior**
- On **install**: generate `deviceId`, `inboxKey`, create VAPID subscription, POST `/v1/devices` with `keyHash` (SHA-256 of raw key), and default `name` (editable).
- On **push**: parse payload `{ itemId, url, sentAt? }` ->
  - If `autoOpen = true` (default), `chrome.tabs.create({ url })`.
  - Else show notification; clicking opens the URL.
  - Immediately `POST /v1/items/:itemId/ack` with `X-Inbox-Key`.
- On **startup**: fetch `pending` and open in order; ACK each.
- **Alarms** (optional): every 3-5 min sanity poll in case push missed.
- **Storm control:** open max **3 tabs/sec**; excess items wait until the cap frees up.
- **Dedupe**: suppress identical URL if opened in last 60s.

**Options Page**
- Show: Device name (editable), `deviceId` (read-only), **QR** + **Copy pairing blob** (JSON), **Rotate Key**, toggle: `autoOpen`.

**Popup (nice-to-have)**
- History list (last 20), toggles mirror options, "Open Options".

**Pairing Blob (JSON)**
```json
{
  "name": "Barron's MacBook Chrome",
  "deviceId": "chr_8f3c0d",
  "inboxKey": "<base64url-128bit>",
  "api": "https://api.beam.example"
}
```

---

## 9) Apple Shortcuts - Requirements
We ship **two Shortcut artifacts**. Shortcut state lives in `BeamDevices.json` stored at **iCloud Drive -> Shortcuts** so it syncs across iOS devices and Shortcuts can read/write silently.

### A) "Add Beam Device" (one-time per Chrome)
**Purpose:** Pair a Chrome install into the phone's local device list.

**Two input methods:**
1) **QR Scan path**
   - Actions (ordered):
     1. **Scan QR/Bar Code**
     2. **Get Dictionary from Input** (expects pairing JSON)
     3. **Get File** -> `BeamDevices.json` (create if missing)
     4. **Set Dictionary/Combine** -> append `{ name, deviceId, inboxKey, api }`
     5. **Filter Duplicates** -> ensure the latest entry wins per `deviceId`
     6. **Save File** -> overwrite `BeamDevices.json`
     7. **Show Notification** -> "Paired: {name}"

2) **Paste path**
   - Actions (ordered):
     1. **Ask for Input** (Paste pairing blob)
     2. **Get Dictionary from Input**
     3-7. Same as above

**Sync note:** Shortcut merges entries before saving so concurrent edits on iPhone/iPad result in last-write-wins per `deviceId`.

**Validation (optional):** Check required keys; if missing -> show alert.

### B) "Send to Beam" (Share Sheet)
**Purpose:** Send current URL to selected device.

**Shortcut settings:** Show in Share Sheet; **Accepted Types: URLs**.

**Actions (ordered):**
1. **Get File** `BeamDevices.json` (Shortcuts/iCloud Drive) -> to Dictionary
2. **Choose from List** (items = device names; include optional "All Desktops")
3. **If** chosen == "All Desktops" -> set `targets` = array of all devices; **Otherwise** `targets` = [chosen device]
4. **Repeat with Each** in `targets`:
  - **Dictionary** -> `{ "url": Shortcut Input, "sentAt": Current Date }`
  - **Get Contents of URL** (POST)
    - URL: `{{api}}/v1/inbox/{{deviceId}}`
    - Headers: `Content-Type: application/json`, `X-Inbox-Key: {{inboxKey}}`
    - Body: above Dictionary
  - **If** response status == 401 -> Show alert "Re-pair this device" and stop processing remaining targets.
5. **Show Notification** -> "Sent to {{deviceName or All}}"

### C) **Separate per-device shortcuts** (fast path)
Create distinct shortcuts:
- **Send to MacBook**
- **Send to Studio Desktop**

Each hard-codes `{api, deviceId, inboxKey}` for that one device and skips the picker (steps reduce to: Build body -> POST -> Notify). Mark each to **Show in Share Sheet** (URLs) and include `sentAt` for parity.

**Default device handling:** For MVP we rely on the picker and per-device shortcuts above; no additional "default device" toggle is shipped.

---

## 10) Pairing UX (QR & Paste)
- **In Chrome Options:**
  - Show a QR and a "Copy JSON" button.
  - Button: **Rotate Key** (invalidates old key; shows updated QR/JSON).
- **On iPhone:**
  - Launch **Add Beam Device** -> either scan QR or paste JSON -> device added.

---

## 11) Reliability & Edge Handling
- **Sleeping Chrome:** Push may not deliver; **startup catch-up** guarantees eventual open.
- **Network blips:** Shortcuts POSTs are fire-and-forget; server queues item even if push fails.
- **Duplicates:** 60s dedupe window in extension; no server-side dedupe in MVP.
- **Stale items:** Pending KV entries carry a 7-day TTL and are deleted on ACK sooner.
- **Rate limit:** 10 requests/min per IP and per deviceId enforced via Cloudflare Rules; Worker keeps a lightweight KV fallback (429 with Retry-After).
- **Privacy:** No user accounts; per-device secrets. Server stores URL + minimal metadata.
- **Security:** `inboxKey` only in header; `keyHash` only on server; rotateable. TLS only. Logs redact headers.

---

## 12) Telemetry (MVP, optional)
- Server: counts of enqueues, pushes sent, push failures, pending length.
- Extension: count opened tabs, catch-ups taken, dedup hits.
- No PII beyond device names and URLs (URLs are inherently sensitive -> store minimal retention; allow opt-out).

---

## 13) Acceptance Criteria
- From iOS Safari Share Sheet, sending to a chosen Chrome device opens the tab within **<2s** if Chrome running.
- If Chrome closed, the tab opens on next launch without user action.
- Multiple Chrome devices can be paired; device list appears in Share Sheet.
- Per-device shortcuts work without a picker and send in one tap.
- Pairing works via **QR scan** or **paste**.
- Key rotation invalidates old shortcuts until re-pairing.

---

## 14) Open Questions
- Minimum macOS/Chrome versions to support? (Assume latest stable + n-2.)

---

## 15) Milestones
1. **Week 1:** Chrome extension skeleton (MV3), Options page with QR/JSON, service worker that opens tabs, local device store.
2. **Week 1:** Backend endpoints (`/devices`, `/inbox`, `/pending`, `/ack`) + Web Push.
3. **Week 2:** Shortcuts - Add Device (QR + paste), Send to Beam (picker), and per-device variants.
4. **Week 2:** Catch-up, dedupe, rate-limit; smoke tests; internal alpha.

---

## 16) Future Work (post-MVP)
- iOS receiving via APNs; Android sender/receiver; image/file payloads via object storage.
- Identity (Firebase/Clerk) for multi-user sharing; teams; device presence.
- Desktop app (menu-bar) for stronger wake delivery.
- Rich preview (favicon/title) and rules (auto-group by domain).



## 17) Hosting & Deployment - Cloudflare Workers (Decision)
**Decision:** Host the backend on **Cloudflare Workers**.

**Why:** Single-file deploy, global edge routing, built-in Web Crypto for VAPID signing, generous free tier sufficient for personal low-volume use. Fits our minimal API and push-fanout needs without standing up servers.

### 17.1 Runtime & Build
- Runtime: Cloudflare Workers (edge), `fetch(request, env, ctx)` entrypoint.
- Build: `wrangler` with modules syntax; TypeScript optional.
- Env bindings (Secrets):
  - `VAPID_PRIVATE_KEY` (base64url or PEM)
  - `VAPID_PUBLIC_KEY` (base64url)
  - Optional storage binding for catch-up:
    - **KV** (`BEAM_KV`) for a simple pending-queue index, or
    - **D1** (`BEAM_DB`) if we want SQL queries/history.

### 17.2 Routes (mapped to Worker)
- `POST /v1/devices` -> register/update device `{ deviceId, keyHash, subscription, name }`.
- `POST /v1/inbox/:deviceId` -> validate `X-Inbox-Key`, enqueue (KV/D1 optional), **send Web Push**.
- `GET /v1/devices/:deviceId/pending` -> list undelivered (KV/D1 only if catch-up enabled).
- `POST /v1/items/:itemId/ack` -> acknowledge delivery (KV/D1).
- `POST /v1/devices/:deviceId/rotate-key` -> rotate key (extension generates new raw, sends new `keyHash`).

### 17.3 Persistence Options
- **Phase 1 (MVP-ready):** **KV** (`BEAM_KV`) for pending items to power catch-up; keys by `deviceId:itemId`, value `{url,sentAt}` with a 7-day TTL applied at write.
- **Phase 2:** strengthen persistence (e.g., add optional metadata, retention dashboards) once real usage demands it.
- **Phase 3:** **D1** for richer history/reporting; schema mirrors PRD Data Model (post-MVP history work).

### 17.4 Push Implementation
- Use Worker Web Crypto to create VAPID JWT and encrypt payload to the extension's `subscription`.
- Set `TTL` (~60s) and `urgency` (`high`) for immediacy; handle failures and retry backoff.

### 17.5 Observability & Operations
- Deploy via `wrangler deploy`; use `wrangler tail` for live logs.
- Basic rate limits per `deviceId` and per IP; redact secrets from logs.
- Errors return JSON with code + message; Shortcuts displays a notification on failure.

### 17.6 Example Wrangler Config (abridged)
```toml
name = "beam-lite-api"
main = "src/worker.ts"
compatibility_date = "2025-09-28"

[vars]
# Non-secret vars here

[kv_namespaces]
# Required for MVP catch-up support
{ binding = "BEAM_KV", id = "<kv-id>" }

[d1_databases]
# Uncomment if using D1
# { binding = "BEAM_DB", database_name = "beam", database_id = "<d1-id>" }
```

### 17.7 Security & CORS
- Accept **only** HTTPS; require header `X-Inbox-Key` (random, >=128-bit) and compare to `keyHash`.
- Keep `X-Inbox-Key` out of URLs. Logs must never print headers.
- CORS: default deny; Shortcuts is a native client using direct POST - no broad `Access-Control-Allow-Origin` needed.

### 17.8 Milestone tweaks
- Update Milestone **Week 1**: include `wrangler` project scaffold and deploy `POST /v1/inbox/:deviceId`.
- Update Milestone **Week 2**: enable KV + `/pending` + `/ack` for startup catch-up.
