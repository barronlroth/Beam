import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerDevice, type RegistrationDeps } from "../src/serviceWorker";

describe("registerDevice", () => {
  const apiBaseUrl = "https://api.example.com";
  const deviceName = "Test Chrome";

  let deps: RegistrationDeps;

  beforeEach(() => {
    deps = {
      fetch: vi.fn().mockResolvedValue({ status: 201 }),
      crypto: crypto,
      storage: {
        get: vi.fn().mockResolvedValue(undefined),
        set: vi.fn().mockResolvedValue(undefined)
      },
      getSubscription: vi.fn().mockResolvedValue({
        endpoint: "https://push.example.com/123",
        keys: {
          p256dh: "clientKey",
          auth: "authSecret"
        }
      })
    };
  });

  it("generates deviceId/inboxKey, stores them, and registers with API", async () => {
    await expect(
      registerDevice(deps, { apiBaseUrl, deviceName })
    ).resolves.toEqual(
      expect.objectContaining({
        deviceId: expect.stringMatching(/^chr_/),
        inboxKey: expect.any(String)
      })
    );

    const fetchMock = deps.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${apiBaseUrl}/v1/devices`);
    expect(options?.method).toBe("POST");

    const body = JSON.parse(options?.body as string);
    expect(body).toMatchObject({
      name: deviceName,
      subscription: {
        endpoint: "https://push.example.com/123"
      }
    });

    const storageSet = deps.storage.set as unknown as ReturnType<typeof vi.fn>;
    expect(storageSet).toHaveBeenCalled();
  });
});
