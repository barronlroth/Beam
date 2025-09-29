import { errorResponse, requiredString, safeJson, isObject, jsonResponse } from "../utils";
import { getDevice, putDevice } from "../storage";
import type { Env, DeviceRecord } from "../types";
import { logInfo } from "../logger";

type RegisterDeviceBody = {
  deviceId: unknown;
  keyHash: unknown;
  subscription: unknown;
  name: unknown;
};

const DEVICE_ID_PATTERN = /^chr_[A-Za-z0-9]{6,}$/;
const KEY_HASH_PATTERN = /^[A-Fa-f0-9]{64}$/;

const normalizeName = (value: string) => value.trim().slice(0, 120);

export const registerDevice = async (request: Request, env: Env): Promise<Response> => {
  const parsed = await safeJson<RegisterDeviceBody>(request);
  if (parsed instanceof Response) {
    return parsed;
  }

  const errors: string[] = [];

  const deviceIdError = requiredString(parsed.deviceId, "deviceId");
  if (deviceIdError) {
    errors.push(deviceIdError);
  } else if (!DEVICE_ID_PATTERN.test(parsed.deviceId as string)) {
    errors.push("deviceId must start with 'chr_' and contain alphanumerics");
  }

  const keyHashError = requiredString(parsed.keyHash, "keyHash");
  if (keyHashError) {
    errors.push(keyHashError);
  } else if (!KEY_HASH_PATTERN.test(parsed.keyHash as string)) {
    errors.push("keyHash must be a 64-character hex string (SHA-256)");
  }

  if (!isObject(parsed.subscription)) {
    errors.push("subscription must be an object");
  }

  const nameError = requiredString(parsed.name, "name");
  if (nameError) {
    errors.push(nameError);
  }

  if (errors.length > 0) {
    return errorResponse("ERR_VALIDATION", errors.join("; "), 400);
  }

  const deviceId = parsed.deviceId as string;
  const keyHash = (parsed.keyHash as string).toLowerCase();
  const subscription = parsed.subscription as Record<string, unknown>;
  const name = normalizeName(parsed.name as string);

  const now = new Date().toISOString();
  const existing = await getDevice(env, deviceId);

  const record: DeviceRecord = {
    deviceId,
    keyHash,
    subscription,
    name,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };

  await putDevice(env, record);

  logInfo("device.registered", {
    deviceId,
    updated: Boolean(existing)
  });

  return jsonResponse({ deviceId, updated: Boolean(existing) }, { status: existing ? 200 : 201 });
};
