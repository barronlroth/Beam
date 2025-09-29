import { describe, it, expect, beforeEach, vi } from "vitest";

const chromeAny = (globalThis as any).chrome;
const storageGetMock = vi.fn((key: string, callback: (value: Record<string, unknown>) => void) => {
  callback({});
});
const storageSetMock = vi.fn((items: Record<string, unknown>, callback?: () => void) => {
  callback?.();
});

chromeAny.storage.local.get = storageGetMock;
chromeAny.storage.local.set = storageSetMock;

vi.mock("../src/swRuntime", () => {
  return {
    handleInstall: vi.fn().mockResolvedValue({ deviceId: "chr_mock", inboxKey: "key" }),
    handlePush: vi.fn().mockResolvedValue(undefined),
    resetRuntimeState: vi.fn()
  };
});

import { handleInstall, handlePush, resetRuntimeState } from "../src/swRuntime";
import "../src/sw";

const getListeners = () => (globalThis as any).__listeners as Record<string, Function[]>;

describe("service worker entry", () => {
  beforeEach(() => {
    storageGetMock.mockClear().mockImplementation((key: string, callback: (value: Record<string, unknown>) => void) => {
      callback({});
    });
    storageSetMock.mockClear().mockImplementation((items: Record<string, unknown>, callback?: () => void) => {
      callback?.();
    });
    resetRuntimeState();
  });

  it("registers install listener and calls runtime", async () => {
    storageGetMock.mockImplementation((key: string, callback: (value: Record<string, unknown>) => void) => {
      if (key === "beam.config") {
        callback({ "beam.config": { apiBaseUrl: "https://api.example.com", deviceName: "Test Chrome" } });
      } else {
        callback({});
      }
    });

    const listeners = getListeners();
    expect(listeners.install).toHaveLength(1);

    const event = {
      waitUntil: vi.fn(async (p: Promise<unknown>) => {
        await p;
      })
    } as unknown as ExtendableEvent;

    await listeners.install[0](event);
    expect(event.waitUntil).toHaveBeenCalled();
    expect(handleInstall).toHaveBeenCalled();
  });

  it("handles push event and opens tab via runtime", async () => {
    const listeners = getListeners();
    expect(listeners.push).toHaveLength(1);

    const payload = JSON.stringify({ itemId: "itm_1", url: "https://example.com" });
    const event = {
      data: {
        json: () => JSON.parse(payload)
      }
    } as unknown as PushEvent;

    await listeners.push[0](event);
    expect(handlePush).toHaveBeenCalledWith(expect.anything(), {
      itemId: "itm_1",
      url: "https://example.com"
    });
  });
});
