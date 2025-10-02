# Cloudflare Worker Secret Setup

Run the following commands from the repository root. Replace `<YOUR_API_TOKEN>` with the scoped Cloudflare API token (Workers + KV permissions). Each command will prompt Wrangler to set a secret on the **production** worker. Repeat with `--env staging` for the staging worker once production secrets are in place.

```bash
# Set the API token in your shell
export CLOUDFLARE_API_TOKEN=<YOUR_API_TOKEN>

# Navigate to the worker package (optional if already there)
cd worker

# Production secrets
printf 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEMM9_q2VcAbZIQ-R289Y1JjXSb6mA9LzS2lTe_jVhBxGPwVu1uyGeMw9cbGJsZ7K7-Xle7NVSIS-CcKxsDGHdyg' | \
  npx wrangler secret put VAPID_PUBLIC_KEY

printf 'MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgV3Whuqe495Yy5d5uM5ql8MniywM4d_5Pwcbny-XGDnmhRANCAAQwz3-rZVwBtkhD5Hbz1jUmNdJvqYD0vNLaVN7-NWEHEY_BW7W7IZ4zD1xsYmxnsrv5eV7s1VIhL4JwrGwMYd3K' | \
  npx wrangler secret put VAPID_PRIVATE_KEY

printf 'mailto:founder@beam-lite.dev' | \
  npx wrangler secret put VAPID_SUBJECT

# Staging secrets (same values for now)
printf 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEMM9_q2VcAbZIQ-R289Y1JjXSb6mA9LzS2lTe_jVhBxGPwVu1uyGeMw9cbGJsZ7K7-Xle7NVSIS-CcKxsDGHdyg' | \
  npx wrangler secret put VAPID_PUBLIC_KEY --env staging

printf 'MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgV3Whuqe495Yy5d5uM5ql8MniywM4d_5Pwcbny-XGDnmhRANCAAQwz3-rZVwBtkhD5Hbz1jUmNdJvqYD0vNLaVN7-NWEHEY_BW7W7IZ4zD1xsYmxnsrv5eV7s1VIhL4JwrGwMYd3K' | \
  npx wrangler secret put VAPID_PRIVATE_KEY --env staging

printf 'mailto:founder@beam-lite.dev' | \
  npx wrangler secret put VAPID_SUBJECT --env staging
```

If you prefer to avoid `export`, prefix each `npx wrangler secret` command with `CLOUDFLARE_API_TOKEN=<YOUR_API_TOKEN>`. Wrangler will confirm each secret and store it on the Worker.

