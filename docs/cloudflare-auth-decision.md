# Cloudflare Access & Credential Strategy

## Context
- **Service topology:** iOS Shortcuts send URL payloads to a Cloudflare Worker; the Worker queues items in Cloudflare KV and pushes to Chrome extensions.
- **Team workflow:** Multiple laptops need to deploy / update the Worker and manage KV namespaces. Work happens from different networks (home, office, travel).
- **Future goals:** Publish the Chrome extension to the Chrome Web Store and support external users. Phones/laptops must operate across any internet connection (not just LAN).
- **Operational constraints:** We want minimal day-to-day overhead, avoid sharing all-powerful credentials, and keep a path to tighten security as the service grows.

## Options Considered

### 1. Scoped Cloudflare API Token (**Chosen**)
- Create a token with the minimum scopes required (Workers KV:Read/Write, Workers Scripts:Read/Edit/Deploy).
- Store it in the MCP secret vault (or encrypted per developer). Each laptop configures Wrangler once (`wrangler login --api-token <token>`).
- Use the same token for CI/CD or provision separate tokens per automation / developer for better audit trails.

**Implications**
- *Security:* If leaked, damage is limited to the Worker + KV namespaces specified by the token. Auditable in Cloudflare.
- *Operations:* One-time setup per machine or per automated pipeline. Token rarely changes unless voluntarily rotated.
- *Scalability:* Works when the extension is public. End users never see the token; they only receive `deviceId` + `inboxKey` when pairing.

### 2. Global API Key
- Cloudflare’s account-wide key with full privileges.
- Fast to set up; a single key works everywhere.

**Implications**
- *Security:* Leaking the key grants complete control over DNS, Workers, KV—entire Cloudflare account. Hard to audit.
- *Operations:* Simple, but extremely high blast radius. Not sustainable when more engineers/automation enter the picture.

### 3. Worker Service Bindings
- Allow one Worker to call another without sharing secrets.
- **Not applicable** for day-to-day deploys from our laptops; they do not replace Wrangler authentication.

## Decision
Use a **scoped Cloudflare API token** for all Worker and KV management. Treat the token like an infrastructure secret (store in MCP vault or secure password manager). Do **not** distribute tokens with the extension or Shortcuts—end users pair via inbox keys only.

## Operational Plan
1. **Provision namespaces**
   - Create two KV namespaces (`BEAM_KV` for production, staging) through Cloudflare’s dashboard or `wrangler kv:namespace create`.
   - Record the namespace IDs and update `worker/wrangler.toml`.

2. **Generate VAPID credentials**
   - Use `npx web-push generate-vapid-keys` (or similar) to produce public/private keys.
   - Store them as Worker secrets per environment:
     ```bash
     wrangler secret put VAPID_PUBLIC_KEY
     wrangler secret put VAPID_PRIVATE_KEY
     wrangler secret put VAPID_SUBJECT # e.g. mailto:founder@example.com
     ```

3. **Configure Wrangler**
   - Add the scoped API token to each developer laptop once (`wrangler login --api-token` or set `CLOUDFLARE_API_TOKEN`).
   - For automation, store the token in CI secrets.

4. **Rotate & Revoke**
   - If a laptop is lost or automation compromised, revoke the single token from Cloudflare’s dashboard without affecting other tokens.

## Future Enhancements
- When moving beyond inbox keys, we can layer account auth (OAuth, JWT) on top of the Worker without touching this token model.
- For larger teams, issue individual tokens per engineer or per environment to tighten auditing.
- Once stable, add automated pipelines (e.g., GitHub Actions) so most deploys use CI-held tokens rather than personal machines.

**Bottom line:** Scoped API tokens give us a one-and-done setup per machine, protect the broader Cloudflare account, and scale from today’s internal use to a future Chrome Web Store release.
