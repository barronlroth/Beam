# Building Beam Lite Shortcuts (iOS)

These steps recreate the two primary Shortcuts for Beam Lite: **Add Beam Device** and **Send to Beam**. Follow them on any iPhone/iPad running iOS 17+.

## Prerequisites
- Beam Lite Chrome extension installed and paired options page available (to supply the pairing blob).
- iCloud Drive enabled for Shortcuts so `BeamDevices.json` can be stored at `Shortcuts/BeamDevices.json`.
- Latest pairing JSON (from the extension options page) available as QR code or clipboard text.

---

## Shortcut 1: Add Beam Device
Purpose: capture the pairing blob (QR or pasted JSON) and append it to `BeamDevices.json`, deduping on `deviceId`.

### A. Create the Shortcut
1. Open **Shortcuts** → tap **+** → name it “Add Beam Device”.
2. Tap **Add Action** and build the following flow:

| Step | Action | Configuration |
| --- | --- | --- |
| 1 | **Scan QR/Bar Code** | (leave default). Add an alternate path: “Otherwise” → “Ask for Input” (Text). |
| 2 | **If Result is Text** | Use `Otherwise` branch to handle manual paste. |
| 3 | **Get Dictionary from Input** | Input = Result from QR or Ask for Input. |
| 4 | **If Dictionary Has Keys** | Required keys: `deviceId`, `inboxKey`, `api`. If missing, show alert and stop. |
| 5 | **Get File** | File = `BeamDevices.json`, Service = **iCloud Drive**, Path = Shortcuts folder, “Create if not found” enabled. |
| 6 | **Get Contents of File** | Interpret as Dictionary. Default to empty list if file is empty. |
| 7 | **Filter Files** (Dictionary) | Use **Repeat with Each** to build an updated list: remove any item whose `deviceId` matches new entry. |
| 8 | **Add Dictionary** | Append `{ name, deviceId, inboxKey, api }` from pairing blob. |
| 9 | **Save File** | Overwrite `BeamDevices.json` with the updated list (format JSON). |
|10 | **Show Notification** | “Paired: (name)”. |

3. Under Shortcut settings:
   - Toggle **Add to Home Screen** or widget as desired.
   - Ensure **Show in Share Sheet** is **disabled** (not needed).

---

## Shortcut 2: Send to Beam (Share Sheet)
Purpose: send the current URL to one or more paired devices and handle 401 re-pair prompts.

### A. Create the Shortcut
1. Duplicate the following flow in a new shortcut named “Send to Beam”.

| Step | Action | Configuration |
| --- | --- | --- |
| 1 | **Get File** | File = `BeamDevices.json` (Shortcuts/iCloud). Create if not found. |
| 2 | **Get Contents of File** | Interpret as Dictionary/List. |
| 3 | **Choose from List** | Items = device “name” values. Add custom option “All Desktops”. |
| 4 | **If Selection is All Desktops** | Use entire list; else wrap the chosen dictionary in a single-item list. |
| 5 | **Repeat with Each** | Within the loop: |
| 5a | **Dictionary** | Build `{ "url": Shortcut Input, "sentAt": Current Date }`. |
| 5b | **Get Contents of URL** | Method POST, URL `{{api}}/v1/inbox/{{deviceId}}`, headers `Content-Type: application/json`, `X-Inbox-Key: {{inboxKey}}`, request body = dictionary. |
| 5c | **If Result Details** | If “Status Code” == 401 → **Show Alert** (“Re-pair this device”), **Stop Shortcut**. |
| 6 | **End Repeat** | After loop, continue. |
| 7 | **Show Notification** | “Sent to {{device name or All}}”. |

2. Shortcut settings:
   - Toggle **Show in Share Sheet** → accepted types: URLs, Safari web pages.
   - Optionally pin to Home Screen.

### B. Per-Device Shortcuts
- Duplicate “Send to Beam”, hard-code a single device dictionary (skip the picker), label it “Send to ‹Device›”, and enable Share Sheet if desired.

---

## Exporting Shortcuts
1. Test each shortcut end-to-end (pair via QR, send to running Chrome, send while Chrome is closed to confirm catch-up). Rotate a key in the extension to ensure 401 handling works.
2. In the Shortcuts app, tap the … menu → **Share** → **Export File** to save `.shortcut` bundles. Store them under `shortcuts/` (exclude secrets). Name them clearly (e.g., `Add Beam Device.shortcut`).
3. Optional: generate iCloud share links after testing and record them in `shortcuts/README.md` or an internal doc.

---

## Notes & Tips
- `BeamDevices.json` acts as the device roster. The extension options page QR contains `name`, `deviceId`, `inboxKey`, `api`. Ensure new pairings overwrite old entries by `deviceId`.
- If iCloud prompts for access permissions, enable “Allow Shortcuts to access iCloud Drive” in Settings.
- For debugging, add temporary “Quick Look” or “Show Alert” actions to inspect the payload or HTTP response.

This checklist mirrors the MVP requirements and should let any team member rebuild the shortcuts without reverse-engineering the existing flows.
