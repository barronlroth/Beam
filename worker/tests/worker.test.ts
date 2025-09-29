import { describe, it, expect, beforeEach } from "vitest";
import crypto from "node:crypto";
import worker from "../src/worker";
import type { Env, PendingItem } from "../src/types";

class MemoryKV implements KVNamespace {
  private store = new Map<string, string>();
  private expirations = new Map<string, number>();

  async get(key: string): Promise<string | null> {
    this.evictExpired(key);
    return this.store.get(key) ?? null;
  }

  async put(key: string, value: string, options?: KVNamespacePutOptions): Promise<void> {
    this.store.set(key, value);
    if (options?.expirationTtl) {
      const expires = Math.floor(Date.now() / 1000) + options.expirationTtl;
      this.expirations.set(key, expires);
    } else if (options?.expiration) {
      this.expirations.set(key, options.expiration);
    }
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
    this.expirations.delete(key);
  }

  async list(options?: KVNamespaceListOptions): Promise<KVNamespaceListResult<string>> {
    const keys = [] as KVNamespaceListKey<string>[];
    const prefix = options?.prefix;
    for (const key of Array.from(this.store.keys())) {
      this.evictExpired(key);
      if (!this.store.has(key)) continue;
      if (prefix && !key.startsWith(prefix)) continue;
      keys.push({ name: key });
    }
    return { keys, list_complete: true }; // eslint-disable-line camelcase
  }

  private evictExpired(key: string) {
    const expires = this.expirations.get(key);
    if (expires && expires <= Math.floor(Date.now() / 1000)) {
      this.store.delete(key);
      this.expirations.delete(key);
    }
  }
}

declare global {
  // eslint-disable-next-line no-var
  var crypto: Crypto;
}

if (!globalThis.crypto || !("subtle" in globalThis.crypto)) {
  Object.defineProperty(globalThis, "crypto", {
    value: crypto.webcrypto,
    configurable: true
  });
}

describe("Beam Worker", () => {
  let env: Env;
  const ctx: ExecutionContext = {
    waitUntil: () => undefined,
    passThroughOnException: () => undefined
  };

  beforeEach(() => {
    env = {
      API_VERSION: "v1",
      BEAM_KV: new MemoryKV()
    };
  });

  it("registers a device and returns 201 on first registration", async () => {
    const secret = "test-secret";
    const keyHash = crypto.createHash("sha256").update(secret).digest("hex");

    const response = await worker.fetch(
      new Request("http://localhost/v1/devices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          deviceId: "chr_abc1234",
          keyHash,
          subscription: {},
          name: "Test Device"
        })
      }),
      env,
      ctx
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toEqual({ deviceId: "chr_abc1234", updated: false });
  });

  describe("inbox flow", () => {
    const secret = "test-secret";
    const keyHash = crypto.createHash("sha256").update(secret).digest("hex");
    const deviceId = "chr_inbox12";

    const registerDevice = async () => {
      await worker.fetch(
        new Request("http://localhost/v1/devices", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            deviceId,
            keyHash,
            subscription: {},
            name: "Inbox Device"
          })
        }),
        env,
        ctx
      );
    };

    beforeEach(async () => {
      await registerDevice();
    });

    it("enqueues a URL and surfaces it in pending list", async () => {
      const enqueueRes = await worker.fetch(
        new Request(`http://localhost/v1/inbox/${deviceId}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-inbox-key": secret
          },
          body: JSON.stringify({ url: "https://example.com", sentAt: "2025-01-01T00:00:00Z" })
        }),
        env,
        ctx
      );

      expect(enqueueRes.status).toBe(202);
      const enqueueBody = await enqueueRes.json();
      expect(enqueueBody.itemId).toMatch(/^itm_/);

      const pendingRes = await worker.fetch(
        new Request(`http://localhost/v1/devices/${deviceId}/pending`, {
          headers: { "x-inbox-key": secret }
        }),
        env,
        ctx
      );

      expect(pendingRes.status).toBe(200);
      const pendingBody = await pendingRes.json();
      expect(pendingBody.items).toHaveLength(1);
      const item: PendingItem = pendingBody.items[0];
      expect(item).toMatchObject({ url: "https://example.com", deviceId });

      const ackRes = await worker.fetch(
        new Request(`http://localhost/v1/items/${enqueueBody.itemId}/ack`, {
          method: "POST",
          headers: { "x-inbox-key": secret }
        }),
        env,
        ctx
      );

      expect(ackRes.status).toBe(200);
      const ackBody = await ackRes.json();
      expect(ackBody).toEqual({ acknowledged: true, itemId: enqueueBody.itemId });

      const afterAck = await worker.fetch(
        new Request(`http://localhost/v1/devices/${deviceId}/pending`, {
          headers: { "x-inbox-key": secret }
        }),
        env,
        ctx
      );
      const afterAckBody = await afterAck.json();
      expect(afterAckBody.items).toHaveLength(0);
    });

    it("rotates the key and rejects old credentials", async () => {
      const newSecret = "new-secret";
      const newHash = crypto.createHash("sha256").update(newSecret).digest("hex");

      const rotateRes = await worker.fetch(
        new Request(`http://localhost/v1/devices/${deviceId}/rotate-key`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-inbox-key": secret
          },
          body: JSON.stringify({ keyHash: newHash })
        }),
        env,
        ctx
      );

      expect(rotateRes.status).toBe(200);

      const oldCredsRes = await worker.fetch(
        new Request(`http://localhost/v1/inbox/${deviceId}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-inbox-key": secret
          },
          body: JSON.stringify({ url: "https://example.com" })
        }),
        env,
        ctx
      );

      expect(oldCredsRes.status).toBe(401);

      const newCredsRes = await worker.fetch(
        new Request(`http://localhost/v1/inbox/${deviceId}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-inbox-key": newSecret
          },
          body: JSON.stringify({ url: "https://example.org" })
        }),
        env,
        ctx
      );

      expect(newCredsRes.status).toBe(202);
    });
  });
});
