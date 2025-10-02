# Cloudflare Worker Secret Setup (Template)

Copy this file to `docs/cloudflare-secret-setup.md`, fill in your actual VAPID keys and contact email, and keep that copy out of source control. The `.gitignore` already excludes the non-template filename.

```bash
# Example usage (replace placeholders)
export CLOUDFLARE_API_TOKEN=<YOUR_API_TOKEN>
cd worker

printf '<VAPID_PUBLIC_KEY>' | npx wrangler secret put VAPID_PUBLIC_KEY
printf '<VAPID_PRIVATE_KEY>' | npx wrangler secret put VAPID_PRIVATE_KEY
printf 'mailto:you@example.com' | npx wrangler secret put VAPID_SUBJECT

# Repeat for staging
printf '<VAPID_PUBLIC_KEY>' | npx wrangler secret put VAPID_PUBLIC_KEY --env staging
printf '<VAPID_PRIVATE_KEY>' | npx wrangler secret put VAPID_PRIVATE_KEY --env staging
printf 'mailto:you@example.com' | npx wrangler secret put VAPID_SUBJECT --env staging
```

Keep real keys in a secure vault.
