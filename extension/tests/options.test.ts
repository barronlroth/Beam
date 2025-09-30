import { describe, it, expect, beforeEach, vi } from "vitest";

const htmlTemplate = `
  <form id="config-form">
    <input id="apiBase" />
    <input id="deviceName" />
    <input id="autoOpen" type="checkbox" />
    <button id="saveButton" type="submit"></button>
    <button id="rotateButton" type="button"></button>
  </form>
  <p id="status"></p>
  <dd id="deviceId"></dd>
  <dd id="inboxKey"></dd>
  <div>
    <button id="copyPairing" type="button"></button>
    <textarea id="pairingJson"></textarea>
    <img id="qrImage" />
  </div>
`;

const storageGetMock = vi.fn();
const storageSetMock = vi.fn((items: Record<string, unknown>, callback?: () => void) => {
  callback?.();
});
const sendMessageMock = vi.fn();

const setupClipboard = () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true
  });
  return writeText;
};

let clipboardWriteMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetModules();
  document.body.innerHTML = htmlTemplate;
  storageGetMock.mockReset();
  storageSetMock.mockClear();
  sendMessageMock.mockReset();
  chrome.storage.local.get = storageGetMock;
  chrome.storage.local.set = storageSetMock;
  chrome.runtime.sendMessage = sendMessageMock as unknown as typeof chrome.runtime.sendMessage;
  clipboardWriteMock = setupClipboard();
});

describe("options page", () => {
  it("loads stored config and device details", async () => {
    storageGetMock.mockImplementation((key: string, callback: (value: Record<string, unknown>) => void) => {
      if (key === "beam.config") {
        callback({ "beam.config": { apiBaseUrl: "https://api.example.com", deviceName: "Studio Chrome" } });
      } else if (key === "beam.device") {
        callback({ "beam.device": { deviceId: "chr_test", inboxKey: "secret", apiBaseUrl: "https://api.example.com" } });
      } else if (key === "beam.settings") {
        callback({ "beam.settings": { autoOpen: false } });
      } else {
        callback({});
      }
    });

    await import("../src/options/main");
    await new Promise((resolve) => setTimeout(resolve, 0));

    const apiInput = document.querySelector<HTMLInputElement>("#apiBase");
    const nameInput = document.querySelector<HTMLInputElement>("#deviceName");
    const autoOpen = document.querySelector<HTMLInputElement>("#autoOpen");
    const pairingJson = document.querySelector<HTMLTextAreaElement>("#pairingJson");

    expect(apiInput?.value).toBe("https://api.example.com");
    expect(nameInput?.value).toBe("Studio Chrome");
    expect(autoOpen?.checked).toBe(false);
    expect(pairingJson?.value).toContain("\"deviceId\": \"chr_test\"");
  });

  it("persists config and triggers registration", async () => {
    storageGetMock.mockImplementation((key: string, callback: (value: Record<string, unknown>) => void) => {
      if (key === "beam.config") {
        callback({ "beam.config": { apiBaseUrl: "https://api.example.com", deviceName: "Studio Chrome" } });
      } else {
        callback({});
      }
    });

    sendMessageMock.mockImplementation((payload: unknown, callback: (response: unknown) => void) => {
      callback({ ok: true, device: { deviceId: "chr_test", inboxKey: "newKey", apiBaseUrl: "https://api.example.com" } });
    });

    await import("../src/options/main");
    await new Promise((resolve) => setTimeout(resolve, 0));

    const apiInput = document.querySelector<HTMLInputElement>("#apiBase");
    const nameInput = document.querySelector<HTMLInputElement>("#deviceName");
    const autoOpen = document.querySelector<HTMLInputElement>("#autoOpen");
    const form = document.querySelector<HTMLFormElement>("#config-form");
    const status = document.querySelector<HTMLParagraphElement>("#status");

    if (apiInput && nameInput && autoOpen) {
      apiInput.value = "https://staging.example.com";
      nameInput.value = "Barron's Mac";
      autoOpen.checked = true;
    }

    form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(storageSetMock).toHaveBeenCalled();
    const [firstCall] = storageSetMock.mock.calls;
    expect(firstCall?.[0]).toMatchObject({
      "beam.config": expect.objectContaining({
        apiBaseUrl: "https://staging.example.com",
        deviceName: "Barron's Mac"
      })
    });
    expect(sendMessageMock).toHaveBeenCalledWith({ type: "beam.register" }, expect.any(Function));
    expect(status?.textContent).toContain("Registration complete");
  });

  it("copies pairing JSON to clipboard", async () => {
    storageGetMock.mockImplementation((key: string, callback: (value: Record<string, unknown>) => void) => {
      if (key === "beam.config") {
        callback({ "beam.config": { apiBaseUrl: "https://api.example.com", deviceName: "Studio Chrome" } });
      } else if (key === "beam.device") {
        callback({ "beam.device": { deviceId: "chr_test", inboxKey: "secret", apiBaseUrl: "https://api.example.com" } });
      } else {
        callback({});
      }
    });

    await import("../src/options/main");
    await new Promise((resolve) => setTimeout(resolve, 0));

    document.querySelector<HTMLButtonElement>("#copyPairing")?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(clipboardWriteMock).toHaveBeenCalled();
  });
});
