# Beam Lite Worker

Cloudflare Worker powering device registration, inbox enqueue, push delivery, and catch-up endpoints.

## Quick Start (Local)
1. Install dependencies:
   ```bash
   cd worker
   npm install
   ```
2. Create `.dev.vars` with local secrets (placeholder values for now):
   ```bash
   echo "VAPID_PUBLIC_KEY=changeme" > .dev.vars
   echo "VAPID_PRIVATE_KEY=changeme" >> .dev.vars
   ```
3. Start the worker with an in-memory KV:
   ```bash
   npm run dev
   ```
4. In another terminal, register a device:
   ```bash
   curl -X POST http://127.0.0.1:8787/v1/devices \
     -H 'content-type: application/json' \
     -d '{"deviceId":"chr_abc1234","keyHash":"'$(echo -n secret | openssl dgst -sha256 | cut -d" " -f2)'","subscription":{},"name":"Test Device"}'
   ```
5. Send a URL into the device inbox:
   ```bash
   curl -X POST http://127.0.0.1:8787/v1/inbox/chr_abc1234 \
     -H 'content-type: application/json' \
     -H 'x-inbox-key: secret' \
     -d '{"url":"https://example.com","sentAt":"2025-09-28T00:00:00Z"}'
   ```
6. Fetch pending items:
   ```bash
   curl -X GET http://127.0.0.1:8787/v1/devices/chr_abc1234/pending \
     -H 'x-inbox-key: secret'
   ```
7. Acknowledge the first pending item (replace `<ITEM_ID>` with the value from the previous response):
   ```bash
   curl -X POST http://127.0.0.1:8787/v1/items/<ITEM_ID>/ack \
     -H 'x-inbox-key: secret'
   ```
8. Rotate the device key:
   ```bash
   curl -X POST http://127.0.0.1:8787/v1/devices/chr_abc1234/rotate-key \
     -H 'x-inbox-key: secret' \
     -H 'content-type: application/json' \
     -d '{"keyHash":"'$(echo -n newsecret | openssl dgst -sha256 | cut -d" " -f2)'"}'
   ```

Logging output is JSON-formatted and redacts secrets automatically. Rate limits are enforced at 10 requests/min per IP and per device using the KV fallback implementation.
