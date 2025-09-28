# Beam Lite

Beam Lite is an MVP for beaming URLs from an iOS Share Sheet directly into Chrome on a selected desktop. It combines an MV3 Chrome extension, native Apple Shortcuts, and a minimal Cloudflare Workers backend.

## Components
- **Chrome Extension:** Receives Web Push messages, opens tabs immediately, performs catch-up, and exposes pairing/rotation UX.
- **Apple Shortcuts:** Maintains paired devices in `BeamDevices.json`, offers a Share Sheet action, and per-device one-tap flows.
- **Cloudflare Worker:** Authenticates requests via inbox keys, stores pending items in Workers KV, emits Web Push notifications, and serves catch-up/ack endpoints.

## Getting Started
1. Read the PRD (`prd-mvp.md`) to understand goals and scope.
2. Review the technical design (`tech-design.md`) for detailed flows and the proposed monorepo structure.
3. Stand up the Cloudflare Worker with a KV namespace for pending items.
4. Build and load the Chrome extension (MV3) in developer mode.
5. Import the Shortcuts (`Add Beam Device`, `Send to Beam`, and per-device variants) on iOS.

## Repository Layout
```
/beam-lite
  /apps
    /chrome-extension      # MV3 source
    /shortcuts             # Shortcut exports & tooling
  /services
    /api-worker            # Cloudflare Worker source
  /packages
    /shared-types          # Shared schemas and DTOs
    /shared-utils          # Optional shared helpers
  /infrastructure
    /terraform             # Future IaC (placeholder)
    /wrangler              # Worker configs per environment
  prd-mvp.md               # Product requirements
  tech-design.md           # Technical design
  README.md
```

## Status
- MVP requirements defined and validated (catch-up included).
- Technical design drafted; implementation ready to begin once tooling is scaffolded.

