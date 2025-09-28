# Beam Lite

Beam Lite is an MVP for beaming URLs from an iOS Share Sheet directly into Chrome on a selected desktop. It combines an MV3 Chrome extension, native Apple Shortcuts, and a minimal Cloudflare Workers backend.

## Components
- **Chrome Extension:** Receives Web Push messages, opens tabs immediately, performs catch-up, and exposes pairing/rotation UX.
- **Apple Shortcuts:** Maintains paired devices in `BeamDevices.json`, offers a Share Sheet action, and per-device one-tap flows.
- **Cloudflare Worker:** Authenticates requests via inbox keys, stores pending items in Workers KV, emits Web Push notifications, and serves catch-up/ack endpoints.

## Getting Started
1. Read the PRD (`docs/prd-mvp.md`) to understand goals and scope.
2. Review the technical design (`docs/tech-design.md`) for detailed flows and the proposed repository structure.
3. Stand up the Cloudflare Worker with a KV namespace for pending items.
4. Build and load the Chrome extension (MV3) in developer mode.
5. Import the Shortcuts (`Add Beam Device`, `Send to Beam`, and per-device variants) on iOS.

## Repository Layout
```
/beam-lite
  /extension        # MV3 Chrome extension source
  /worker           # Cloudflare Worker source
  /shortcuts        # Shortcut exports & tooling
  /docs             # prd-mvp.md, tech-design.md, future notes
  README.md
```

## Status
- MVP requirements defined and validated (catch-up included).
- Technical design drafted; implementation ready to begin once tooling is scaffolded.

