import { errorResponse, jsonResponse, requiredString, safeJson, isObject, sha256Hex } from "../utils";
import { getDevice, putDevice } from "../storage";
import type { Env } from "../types";

type RotateBody = {
  keyHash: unknown;
  subscription?: unknown;
  name?: unknown;
};

const HEADER_INBOX_KEY = "x-inbox-key";
const KEY_HASH_PATTERN = /^[A-Fa-f0-9]{64}$/;

export const rotateKey = async (
  request: Request,
  env: Env,
  deviceId: string
): Promise<Response> => {
  const device = await getDevice(env, deviceId);
  if (!device) {
    return errorResponse("ERR_INBOX_UNKNOWN_DEVICE", "Unknown deviceId", 404);
  }

  const rawKey = request.headers.get(HEADER_INBOX_KEY);
  if (!rawKey) {
    return errorResponse("ERR_INBOX_UNAUTHORIZED", "Missing X-Inbox-Key header", 401);
  }

  const hashed = await sha256Hex(rawKey);
  if (hashed !== device.keyHash) {
    return errorResponse("ERR_INBOX_UNAUTHORIZED", "Invalid inbox key", 401);
  }

  const parsed = await safeJson<RotateBody>(request);
  if (parsed instanceof Response) {
    return parsed;
  }

  const keyHashError = requiredString(parsed.keyHash, "keyHash");
  if (keyHashError) {
    return errorResponse("ERR_VALIDATION", keyHashError, 400);
  }

  const newKeyHash = (parsed.keyHash as string).toLowerCase();
  if (!KEY_HASH_PATTERN.test(newKeyHash)) {
    return errorResponse("ERR_VALIDATION", "keyHash must be a 64-character hex string", 400);
  }

  if (newKeyHash === device.keyHash) {
    return errorResponse("ERR_VALIDATION", "keyHash must differ from existing value", 400);
  }

  const updatedDevice = {
    ...device,
    keyHash: newKeyHash,
    subscription: isObject(parsed.subscription) ? (parsed.subscription as Record<string, unknown>) : device.subscription,
    name: typeof parsed.name === "string" && parsed.name.trim().length > 0 ? parsed.name.trim().slice(0, 120) : device.name,
    updatedAt: new Date().toISOString()
  };

  await putDevice(env, updatedDevice);

  return jsonResponse({ rotated: true }, { status: 200 });
};
