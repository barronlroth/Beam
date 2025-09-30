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
    handleStartup: vi.fn().mockResolvedValue(undefined),
    resetRuntimeState: vi.fn()
  };
});

vi.mock("../src/swAlarms", () => {
  return {
    scheduleCatchUp: vi.fn(),
    resetRuntimeState: vi.fn()
  };
});

vi.mock("../src/serviceWorker", () => {
  return {
    ensureDeviceRegistration: vi.fn(),
    rotateDeviceKey: vi.fn().mockResolvedValue({ deviceId: "chr_mock", inboxKey: "newKey" })
  };
});

import { handleInstall, handlePush, handleStartup, resetRuntimeState } from "../src/swRuntime";
import { scheduleCatchUp, resetRuntimeState as resetAlarmState } from "../src/swAlarms";
import { rotateDeviceKey } from "../src/serviceWorker";
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
    resetAlarmState();
    (handleInstall as unknown as { mockClear: () => void }).mockClear?.();
    (handlePush as unknown as { mockClear: () => void }).mockClear?.();
    (handleStartup as unknown as { mockClear: () => void }).mockClear?.();
    (rotateDeviceKey as unknown as { mockClear: () => void }).mockClear?.();
    scheduleCatchUp.mockClear();
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

    const waitPromises: Promise<unknown>[] = [];
    const event = {
      waitUntil: vi.fn((p: Promise<unknown>) => {
        waitPromises.push(p);
      })
    } as unknown as ExtendableEvent;

    await listeners.install[0](event);
    await Promise.all(waitPromises);
    expect(event.waitUntil).toHaveBeenCalled();
    expect(handleInstall).toHaveBeenCalled();
    expect(scheduleCatchUp).toHaveBeenCalledWith(5);
  });

  it("skips install registration when config missing", async () => {
    (handleInstall as unknown as { mockRejectedValueOnce: (value: unknown) => void }).mockRejectedValueOnce?.(
      new Error("Missing beam.config")
    );

    storageGetMock.mockImplementation((key: string, callback: (value: Record<string, unknown>) => void) => {
      callback({});
    });

    const listeners = getListeners();
    const event = {
      waitUntil: vi.fn(async (p: Promise<unknown>) => {
        await p;
      })
    } as unknown as ExtendableEvent;

    await listeners.install[0](event);
    expect(handleInstall).toHaveBeenCalled();
    expect(scheduleCatchUp).not.toHaveBeenCalled();
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

  it("hooks runtime startup to trigger catch-up", async () => {
    const startupListeners = chromeAny.runtime.onStartup.addListener.mock.calls;
    expect(startupListeners).toHaveLength(1);

    const listener = startupListeners[0][0] as () => Promise<void>;
    await listener();
    expect(handleStartup).toHaveBeenCalled();
  });

  it("runs catch-up when alarm fires with matching name", async () => {
    const alarmListeners = chromeAny.alarms.onAlarm.addListener.mock.calls;
    expect(alarmListeners).toHaveLength(1);

    const listener = alarmListeners[0][0] as (alarm: chrome.alarms.Alarm) => Promise<void>;
    await listener({ name: "beam-catchup" } as chrome.alarms.Alarm);
    expect(handleStartup).toHaveBeenCalled();
  });

  it("responds to register message by triggering registration", async () => {
    storageGetMock.mockImplementation((key: string, callback: (value: Record<string, unknown>) => void) => {
      if (key === "beam.config") {
        callback({ "beam.config": { apiBaseUrl: "https://api.example.com", deviceName: "Test Chrome" } });
      } else if (key === "beam.device") {
        callback({ "beam.device": { deviceId: "chr_mock", inboxKey: "key", apiBaseUrl: "https://api.example.com" } });
      } else {
        callback({});
      }
    });

    const messageListener = chromeAny.runtime.onMessage.addListener.mock.calls[0][0] as (
      message: { type?: string },
      sender: unknown,
      sendResponse: (response: unknown) => void
    ) => boolean;

    const sendResponse = vi.fn();
    const handled = messageListener({ type: "beam.register" }, {}, sendResponse);
    expect(handled).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(handleInstall).toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({
      ok: true,
      device: { deviceId: "chr_mock", inboxKey: "key", apiBaseUrl: "https://api.example.com" }
    });
  });

  it("responds to rotate-key message", async () => {
    storageGetMock.mockImplementation((key: string, callback: (value: Record<string, unknown>) => void) => {
      if (key === "beam.config") {
        callback({ "beam.config": { apiBaseUrl: "https://api.example.com", deviceName: "Test Chrome" } });
      } else if (key === "beam.device") {
        callback({ "beam.device": { deviceId: "chr_mock", inboxKey: "key", apiBaseUrl: "https://api.example.com" } });
      } else {
        callback({});
      }
    });

    const messageListener = chromeAny.runtime.onMessage.addListener.mock.calls[0][0] as (
      message: { type?: string },
      sender: unknown,
      sendResponse: (response: unknown) => void
    ) => boolean;

    const sendResponse = vi.fn();
    const handled = messageListener({ type: "beam.rotate-key" }, {}, sendResponse);
    expect(handled).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(rotateDeviceKey).toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({
      ok: true,
      device: { deviceId: "chr_mock", inboxKey: "key", apiBaseUrl: "https://api.example.com" },
      result: { deviceId: "chr_mock", inboxKey: "newKey" }
    });
  });
});
