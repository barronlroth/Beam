# Beam Lite Extension

MV3 Chrome extension that registers Beam Lite devices, receives pushes, and opens tabs on paired desktops.

## Development

```bash
cd extension
npm install
npm run dev       # optional: Vite dev server for options UI
npm test          # Vitest suite covering service worker + options logic
npm run build     # Emits dist/ with sw.js, options bundle, and manifest
```

Load the unpacked extension from the `dist/` folder after running `npm run build` or `npm run dev`.

## Features

- Background service worker handles install, push delivery, startup catch-up, and key rotation.
- Options page collects API base + device name, toggles auto-open, renders pairing JSON, and shows a QR code for Shortcuts.
- Rotate key button generates a new inbox key and updates stored pairing data.
- Auto-open toggle persists to `chrome.storage.local` and updates push behaviour (notification-only when disabled).

## Configuration Flow

1. Build and load the extension (see Development section).
2. Open the options page, enter the Worker API base URL and a device name, then click **Save & Register**.
3. Scan or copy the pairing JSON/QR into the iOS **Add Beam Device** shortcut.
4. Rotate keys from the options page as needed; Shortcuts will prompt to re-pair after a 401 response.

`npm run build` copies `manifest.json` and `icon128.png` into `dist/`. Do not edit the generated files directly—change the sources under `src/` or `public/` instead.
