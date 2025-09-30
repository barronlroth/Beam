import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  handleInstall,
  handlePush,
  handleStartup,
  resetRuntimeState,
  type InstallDeps,
  type PushDeps
} from "../src/swRuntime";

const apiBaseUrl = "https://api.example.com";
const deviceInfo = {
  deviceId: "chr_test123",
  inboxKey: "secretKey",
  apiBaseUrl,
  name: "Test Chrome"
};

const config = {
  apiBaseUrl,
  deviceName: "Test Chrome"
};

describe("swRuntime", () => {
  beforeEach(() => {
    resetRuntimeState();
  });

  describe("handleInstall", () => {
    it("ensures registration using stored config", async () => {
      const storage = {
        get: vi.fn().mockImplementation(async (key: string) => {
          if (key === "beam.config") return config;
          if (key === "beam.device") return undefined;
          return undefined;
        })
      };

      const ensureRegistration = vi.fn().mockResolvedValue({
        deviceId: deviceInfo.deviceId,
        inboxKey: deviceInfo.inboxKey
      });

      const deps: InstallDeps = {
        storage,
        ensureDeviceRegistration: ensureRegistration
      };

      const result = await handleInstall(deps);
      expect(result).toEqual({ deviceId: deviceInfo.deviceId, inboxKey: deviceInfo.inboxKey });
      expect(ensureRegistration).toHaveBeenCalledWith({
        apiBaseUrl: apiBaseUrl,
        deviceName: config.deviceName
      });
    });
  });

  describe("handlePush", () => {
    const baseDeps = () => {
      const storageGet = vi.fn().mockImplementation(async (key: string) => {
        if (key === "beam.device") return deviceInfo;
        if (key === "beam.config") return config;
        return undefined;
      });

      return {
        storage: {
          get: storageGet
        },
        fetch: vi.fn().mockResolvedValue({ status: 200, json: vi.fn(async () => ({})) }),
        tabsCreate: vi.fn().mockResolvedValue(undefined),
        now: vi.fn(() => Date.now()),
        notify: vi.fn().mockResolvedValue(undefined)
      } as unknown as PushDeps;
    };

    const payload = {
      itemId: "itm_1",
      url: "https://example.com",
      sentAt: new Date().toISOString()
    };

    it("opens tab and acknowledges item", async () => {
      const deps = baseDeps();
      await handlePush(deps, payload);

      expect(deps.tabsCreate).toHaveBeenCalledWith({ url: payload.url, active: true });
      expect(deps.fetch).toHaveBeenCalledWith(
        `${apiBaseUrl}/v1/items/${payload.itemId}/ack`,
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ "X-Inbox-Key": deviceInfo.inboxKey })
        })
      );
    });

    it("dedupes identical url within 60s but still ACKs", async () => {
      const deps = baseDeps();
      const time = Date.now();
      deps.now = vi.fn(() => time);

      await handlePush(deps, payload);
      await handlePush(deps, { ...payload, itemId: "itm_2" });

      expect(deps.tabsCreate).toHaveBeenCalledTimes(1);
      expect(deps.fetch).toHaveBeenCalledTimes(2);
    });

    it("limits to 3 tabs per second and schedules remainder", async () => {
      vi.useFakeTimers();
      const deps = baseDeps();
      let currentTime = Date.now();
      deps.now = vi.fn(() => currentTime);

      await Promise.all([
        handlePush(deps, { ...payload, itemId: "itm_a", url: "https://example.com/a" }),
        handlePush(deps, { ...payload, itemId: "itm_b", url: "https://example.com/b" }),
        handlePush(deps, { ...payload, itemId: "itm_c", url: "https://example.com/c" }),
        handlePush(deps, { ...payload, itemId: "itm_d", url: "https://example.com/d" })
      ]);

      expect(deps.tabsCreate).toHaveBeenCalledTimes(3);

      currentTime += 1000;
      vi.advanceTimersByTime(1000);

      expect(deps.tabsCreate).toHaveBeenCalledTimes(4);
      vi.useRealTimers();
    });

    it("respects autoOpen setting and notifies instead of opening", async () => {
      const deps = baseDeps();
      (deps.storage.get as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => {
        if (key === "beam.device") return deviceInfo;
        if (key === "beam.config") return config;
        if (key === "beam.settings") return { autoOpen: false };
        return undefined;
      });

      await handlePush(deps, payload);

      expect(deps.tabsCreate).not.toHaveBeenCalled();
      expect(deps.notify).toHaveBeenCalledWith({
        title: expect.stringContaining("Beam"),
        message: payload.url,
        url: payload.url
      });
      expect(deps.fetch).toHaveBeenCalledWith(
        `${apiBaseUrl}/v1/items/${payload.itemId}/ack`,
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  describe("handleStartup", () => {
    it("fetches pending items and processes them sequentially", async () => {
      const items = [
        { itemId: "itm_1", url: "https://example.com/1" },
        { itemId: "itm_2", url: "https://example.com/2" }
      ];

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn(async () => ({ items }))
      });

      const storageGet = vi.fn().mockImplementation(async (key: string) => {
        if (key === "beam.device") return deviceInfo;
        if (key === "beam.config") return config;
        return undefined;
      });

      const deps: PushDeps = {
        storage: { get: storageGet },
        fetch: fetchMock as unknown as typeof fetch,
        tabsCreate: vi.fn().mockResolvedValue(undefined),
        now: vi.fn(() => Date.now()),
        notify: vi.fn()
      };

      await handleStartup(deps);

      expect(fetchMock).toHaveBeenCalledWith(
        `${apiBaseUrl}/v1/devices/${deviceInfo.deviceId}/pending`,
        expect.objectContaining({ headers: expect.objectContaining({ "X-Inbox-Key": deviceInfo.inboxKey }) })
      );
      expect(deps.tabsCreate).toHaveBeenCalledTimes(2);
    });

    it("respects autoOpen=false during catch-up", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn(async () => ({ items: [{ itemId: "itm_x", url: "https://example.com/x" }] }))
      });

      const storageGet = vi.fn().mockImplementation(async (key: string) => {
        if (key === "beam.device") return deviceInfo;
        if (key === "beam.config") return config;
        if (key === "beam.settings") return { autoOpen: false };
        return undefined;
      });

      const deps: PushDeps = {
        storage: { get: storageGet },
        fetch: fetchMock as unknown as typeof fetch,
        tabsCreate: vi.fn().mockResolvedValue(undefined),
        now: vi.fn(() => Date.now()),
        notify: vi.fn()
      };

      await handleStartup(deps);

      expect(deps.tabsCreate).not.toHaveBeenCalled();
      expect(deps.fetch).toHaveBeenCalledWith(
        `${apiBaseUrl}/v1/items/itm_x/ack`,
        expect.objectContaining({ method: "POST" })
      );
    });
  });
});
