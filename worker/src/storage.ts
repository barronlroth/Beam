import type { DeviceRecord, Env, PendingItem } from "./types";

const DEVICE_PREFIX = "device";
const PENDING_PREFIX = "pending";
const ITEM_INDEX_PREFIX = "pending-index";
const PENDING_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export const deviceKey = (deviceId: string) => `${DEVICE_PREFIX}:${deviceId}`;
export const pendingKey = (deviceId: string, itemId: string) => `${PENDING_PREFIX}:${deviceId}:${itemId}`;
export const itemIndexKey = (itemId: string) => `${ITEM_INDEX_PREFIX}:${itemId}`;

export const getDevice = async (env: Env, deviceId: string): Promise<DeviceRecord | null> => {
  const raw = await env.BEAM_KV.get(deviceKey(deviceId));
  return raw ? (JSON.parse(raw) as DeviceRecord) : null;
};

export const putDevice = async (env: Env, record: DeviceRecord): Promise<void> => {
  await env.BEAM_KV.put(deviceKey(record.deviceId), JSON.stringify(record));
};

export const putPendingItem = async (env: Env, item: PendingItem): Promise<void> => {
  const ttl = { expirationTtl: PENDING_TTL_SECONDS } as const;
  await env.BEAM_KV.put(pendingKey(item.deviceId, item.itemId), JSON.stringify(item), ttl);
  await env.BEAM_KV.put(itemIndexKey(item.itemId), item.deviceId, ttl);
};

export const getPendingItem = async (env: Env, deviceId: string, itemId: string): Promise<PendingItem | null> => {
  const raw = await env.BEAM_KV.get(pendingKey(deviceId, itemId));
  return raw ? (JSON.parse(raw) as PendingItem) : null;
};

export const deletePendingItem = async (env: Env, deviceId: string, itemId: string): Promise<void> => {
  await env.BEAM_KV.delete(pendingKey(deviceId, itemId));
  await env.BEAM_KV.delete(itemIndexKey(itemId));
};

export const resolveDeviceIdForItem = async (env: Env, itemId: string): Promise<string | null> => {
  return (await env.BEAM_KV.get(itemIndexKey(itemId))) ?? null;
};

export const listPendingItems = async (env: Env, deviceId: string): Promise<PendingItem[]> => {
  const prefix = `${PENDING_PREFIX}:${deviceId}:`;
  const list = await env.BEAM_KV.list({ prefix });

  if (list.keys.length === 0) {
    return [];
  }

  const results = await Promise.all(
    list.keys.map(async ({ name }) => {
      const raw = await env.BEAM_KV.get(name);
      return raw ? (JSON.parse(raw) as PendingItem) : null;
    })
  );

  return results
    .filter((item): item is PendingItem => item !== null)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
};
