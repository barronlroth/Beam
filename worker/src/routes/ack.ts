import { errorResponse, jsonResponse, sha256Hex } from "../utils";
import { deletePendingItem, getDevice, getPendingItem, resolveDeviceIdForItem } from "../storage";
import type { Env } from "../types";
import { logInfo } from "../logger";

const HEADER_INBOX_KEY = "x-inbox-key";

export const acknowledgeItem = async (
  request: Request,
  env: Env,
  itemId: string
): Promise<Response> => {
  const deviceId = await resolveDeviceIdForItem(env, itemId);
  if (!deviceId) {
    return errorResponse("ERR_ACK_UNKNOWN_ITEM", "Pending item not found", 404);
  }

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

  const pending = await getPendingItem(env, deviceId, itemId);
  if (!pending) {
    return errorResponse("ERR_ACK_UNKNOWN_ITEM", "Pending item not found", 404);
  }

  await deletePendingItem(env, deviceId, itemId);

  logInfo("inbox.acknowledged", { deviceId, itemId });

  return jsonResponse({ acknowledged: true, itemId });
};
