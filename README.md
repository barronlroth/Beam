# Beam Lite

Beam Lite beams URLs from an iOS Share Sheet directly into Chrome on a chosen desktop. It combines an MV3 Chrome extension, native Apple Shortcuts, and a Cloudflare Workers backend.

## Components
- **Chrome Extension:** Receives Web Push messages, opens tabs immediately, performs catch-up, and exposes pairing/rotation UX via the options page.
- **Apple Shortcuts:** Maintains paired devices in `BeamDevices.json`, offers a Share Sheet action, and per-device one-tap flows.
- **Cloudflare Worker:** Authenticates via inbox keys, stores pending items in Workers KV, emits Web Push notifications, and serves catch-up/ack endpoints.

## Getting Started
1. Read the PRD (`docs/prd-mvp.md`) and technical design (`docs/tech-design.md`).
2. Provision Cloudflare resources:
   - KV namespaces (already captured in `worker/wrangler.toml`).
   - Copy `docs/cloudflare-secret-setup.template.md` to `docs/cloudflare-secret-setup.md`, add your keys, and run the listed Wrangler commands (keep the filled file out of source control).
3. Build & load the Chrome extension:
   ```bash
   cd extension
   npm install
   npm test
   npm run build
   ```
   Load the `dist/` folder as an unpacked extension in Chrome.
4. Pair the extension: open the options page, enter API base + device name, click **Save & Register**, copy the pairing JSON/QR.
5. Build the Shortcuts by following `docs/ios-shortcut-build-guide.md` (Add Beam Device, Send to Beam, per-device variants). Export `.shortcut` files to `shortcuts/` when ready.
6. Run end-to-end tests: send while Chrome is running, send while asleep (catch-up), rotate key to verify 401 handling.

## Repository Layout
```
/beam-lite
  /extension        # MV3 Chrome extension source + tests + options UI
  /worker           # Cloudflare Worker source, tests, wrangler config
  /shortcuts        # Shortcut exports, README, sample BeamDevices.json
  /docs             # PRD, technical design, auth decisions, setup guides
  README.md
```

## Docs
- `docs/cloudflare-auth-decision.md` — rationale for the scoped API token approach.
- `docs/cloudflare-secret-setup.md` — exact Wrangler commands for VAPID secrets.
- `docs/ios-shortcut-build-guide.md` — step-by-step shortcut instructions.

## Status
- Worker implemented and tested locally.
- Extension implements push handling, options UI, rotate key flow, catch-up, and has Vitest coverage.
- Cloudflare KV namespaces provisioned; secrets ready via Wrangler commands.
- Shortcuts documentation ready; on-device authoring/export pending.
