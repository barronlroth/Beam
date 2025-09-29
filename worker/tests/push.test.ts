import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { sendWebPush } from "../src/push";
import type { Env } from "../src/types";

class DummyKV implements KVNamespace {
  async get(): Promise<string | null> {
    return null;
  }
  async put(): Promise<void> {}
  async delete(): Promise<void> {}
  async list(): Promise<KVNamespaceListResult<string>> {
    return { keys: [], list_complete: true };
  }
}

const base64UrlEncode = (bytes: Uint8Array) =>
  Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const base64UrlDecode = (input: string) => {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return new Uint8Array(Buffer.from(normalized, "base64"));
};

const createEnv = (): Env => ({
  API_VERSION: "v1",
  BEAM_KV: new DummyKV() as KVNamespace
});

describe("sendWebPush", () => {
  const endpoint = "https://push.example.com/send/123";
  const payload = {
    device: {
      deviceId: "chr_sample",
      subscription: {
        endpoint,
        keys: {
          p256dh: "",
          auth: ""
        }
      }
    },
    item: {
      itemId: "itm_1",
      url: "https://example.com",
      sentAt: new Date().toISOString()
    }
  };

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 201 })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws when VAPID keys missing", async () => {
    const env = createEnv();
    await expect(sendWebPush(env, payload)).rejects.toThrow(/VAPID/);
  });

  it("signs and sends a push request", async () => {
    const env = createEnv();

    const vapidKeys = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"]
    );

    const publicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", vapidKeys.publicKey));
    const publicKey = base64UrlEncode(publicRaw);
    const privateJwk = await crypto.subtle.exportKey("jwk", vapidKeys.privateKey);
    const privateKey = privateJwk.d as string;

    const subscriptionKeys = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveBits", "deriveKey"]
    );

    const clientPublicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", subscriptionKeys.publicKey));
    const authSecret = base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)));

    env.VAPID_PUBLIC_KEY = publicKey;
    env.VAPID_PRIVATE_KEY = privateKey;
    env.VAPID_SUBJECT = "mailto:test@example.com";

    const request = {
      device: {
        deviceId: payload.device.deviceId,
        subscription: {
          endpoint,
          keys: {
            p256dh: base64UrlEncode(clientPublicRaw),
            auth: authSecret
          }
        }
      },
      item: payload.item
    };

    const result = await sendWebPush(env, request);

    expect(result.ok).toBe(true);

    const fetchMock = vi.mocked(globalThis.fetch as typeof fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(endpoint);

    const headers = new Headers(options?.headers as HeadersInit | undefined);
    expect(headers.get("Authorization")).toMatch(/vapid t=/i);
    expect(headers.get("Crypto-Key")).toContain("dh=");
    expect(headers.get("Crypto-Key")).toContain("p256ecdsa=");
    expect(headers.get("Encryption")).toMatch(/salt=/);
    expect(headers.get("Content-Encoding")).toBe("aesgcm");
    expect(headers.get("TTL")).toBe("60");

    const body = options?.body as ArrayBufferLike | undefined;
    expect(body).toBeDefined();
    expect((body as ArrayBufferLike).byteLength).toBeGreaterThan(0);
  });
});
