import { errorResponse, jsonResponse, sha256Hex } from "../utils";
import { getDevice, listPendingItems } from "../storage";
import type { Env } from "../types";

const HEADER_INBOX_KEY = "x-inbox-key";

export const listPending = async (request: Request, env: Env, deviceId: string): Promise<Response> => {
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

  const items = await listPendingItems(env, deviceId);
  return jsonResponse({ items }, { status: 200 });
};
