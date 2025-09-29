import type { DeviceRecord, Env } from "./types";

const DEVICE_PREFIX = "device";

export const deviceKey = (deviceId: string) => `${DEVICE_PREFIX}:${deviceId}`;

export const getDevice = async (env: Env, deviceId: string): Promise<DeviceRecord | null> => {
  const raw = await env.BEAM_KV.get(deviceKey(deviceId));
  return raw ? (JSON.parse(raw) as DeviceRecord) : null;
};

export const putDevice = async (env: Env, record: DeviceRecord): Promise<void> => {
  await env.BEAM_KV.put(deviceKey(record.deviceId), JSON.stringify(record));
};
