# Beam Lite Shortcuts

This folder documents the two Shortcuts required for the MVP and how to export them for teammates. Shortcut state is stored in `BeamDevices.json` under **iCloud Drive → Shortcuts** so it remains in sync across iOS devices.

## Shared State File

Example `BeamDevices.json` entry:

```json
[
  {
    "name": "Barron's MacBook Chrome",
    "deviceId": "chr_abc123",
    "inboxKey": "randomInboxKey==",
    "api": "https://staging.beam-lite.dev"
  }
]
```

Keep the file in `Shortcuts/BeamDevices.json`. Shortcuts will create the file automatically when the Add Device flow runs the first time.

---

## Shortcut 1 — Add Beam Device

Purpose: pair a Chrome extension instance with the iOS device and append it to `BeamDevices.json`.

### QR Scan Path
1. **Scan QR/Barcode** → returns the pairing blob from the extension options page.
2. **Get Dictionary from Input** → parse JSON.
3. **Get File** → `BeamDevices.json` (create if missing).
4. **Combine Dictionaries** → append the new device, dedupe by `deviceId` (keep the latest entry).
5. **Save File** → overwrite `BeamDevices.json` with the merged list.
6. **Show Notification** → “Paired: {name}”.

### Paste Path
1. **Ask for Input** → prompt for JSON blob.
2. **Get Dictionary from Input** → parse.
3. Repeat steps 3–6 above.

Validation: Add a “If Dictionary has Keys” check to ensure `deviceId`, `inboxKey`, and `api` exist before saving.

---

## Shortcut 2 — Send to Beam (Share Sheet)

Purpose: share the current Safari URL to a chosen desktop.

1. **Get File** `BeamDevices.json` → Dictionary.
2. **Choose from List** using device `name` values (include “All Desktops” option).
3. **If** selection == “All Desktops” use entire list; otherwise wrap the selected device in an array.
4. **Repeat with Each** target:
   - Build Dictionary `{ "url": Shortcut Input, "sentAt": Current Date }`.
   - **Get Contents of URL** (POST) → `{{api}}/v1/inbox/{{deviceId}}` with headers `Content-Type: application/json` and `X-Inbox-Key: {{inboxKey}}`.
   - **If** response status == 401 → **Show Alert** “Re-pair this device” and **Stop Shortcut**.
5. **Show Notification** → “Sent to {{deviceName or All}}”.

### Per-Device Variants
Duplicate the Share Sheet shortcut and hard-code `deviceId`, `inboxKey`, and `api` for one-tap “Send to MacBook”/“Send to Studio Desktop” actions. Skip the picker (steps reduce to build body → POST → notify).

---

## Export & Sharing Checklist

1. **Test on device**
   - Pair via both QR scan and paste.
   - Send to a running Chrome instance and to a sleeping laptop (validate catch-up).
   - Confirm 401 alert fires after rotating the key in the extension.
2. **Export shortcuts**
   - In Shortcuts, use “Share” → “Export File” to create `.shortcut` bundles for:
     - `Add Beam Device`
     - `Send to Beam`
     - each per-device quick action.
   - Store the exports in this directory (keep filenames descriptive).
3. **Generate share links**
   - After export, optionally create iCloud share links and add references here once flows stabilize.

---

## Updating Pairing Data

1. Open the extension options page.
2. Rotate the key (if needed) and copy the JSON blob.
3. Run **Add Beam Device**.
4. Re-run **Send to Beam** to confirm delivery.

Do not commit real `BeamDevices.json` contents or `.shortcut` bundles containing production keys.
