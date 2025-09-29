import { errorResponse, jsonResponse, requiredString, safeJson, validateHttpUrl, sha256Hex } from "../utils";
import { getDevice, putPendingItem } from "../storage";
import type { Env, PendingItem } from "../types";
import { logInfo, logWarn } from "../logger";
import { checkRateLimit } from "../rateLimit";

type InboxBody = {
  url: unknown;
  sentAt?: unknown;
};

const HEADER_INBOX_KEY = "x-inbox-key";

const normalizeSentAt = (value?: string): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return new Date(parsed).toISOString();
};

export const enqueueToInbox = async (request: Request, env: Env, deviceId: string): Promise<Response> => {
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

  const clientIp = request.headers.get("cf-connecting-ip") ?? "unknown";
  const ipIdentifier = `ip:${clientIp}`;
  const deviceIdentifier = `device:${deviceId}`;

  const [ipLimit, deviceLimit] = await Promise.all([
    checkRateLimit(env, ipIdentifier, RATE_LIMIT_OPTIONS),
    checkRateLimit(env, deviceIdentifier, RATE_LIMIT_OPTIONS)
  ]);

  if (!ipLimit.allowed) {
    return rateLimitResponse(ipLimit.reset, { deviceId, scope: "ip", identifier: clientIp });
  }

  if (!deviceLimit.allowed) {
    return rateLimitResponse(deviceLimit.reset, { deviceId, scope: "device" });
  }

  const parsed = await safeJson<InboxBody>(request);
  if (parsed instanceof Response) {
    return parsed;
  }

  const errors: string[] = [];
  const urlError = requiredString(parsed.url, "url");
  if (urlError) {
    errors.push(urlError);
  } else if (!validateHttpUrl(parsed.url as string)) {
    errors.push("url must be a valid http/https URL");
  }

  let sentAtIso = normalizeSentAt(typeof parsed.sentAt === "string" ? parsed.sentAt : undefined);
  if (parsed.sentAt !== undefined && sentAtIso === null) {
    errors.push("sentAt must be a valid datetime string");
  }

  if (errors.length > 0) {
    return errorResponse("ERR_VALIDATION", errors.join("; "), 400);
  }

  const itemId = `itm_${crypto.randomUUID().replace(/-/g, "")}`;
  const createdAt = new Date().toISOString();
  if (!sentAtIso) {
    sentAtIso = createdAt;
  }

  const record: PendingItem = {
    itemId,
    deviceId,
    url: parsed.url as string,
    sentAt: sentAtIso,
    createdAt
  };

  await putPendingItem(env, record);

  // TODO: Web Push delivery implementation (crypto.subtle based VAPID signing)

  logInfo("inbox.enqueued", {
    deviceId,
    itemId
  });

  return jsonResponse({ itemId, enqueued: true }, { status: 202 });
};
const RATE_LIMIT_OPTIONS = { limit: 10, windowSeconds: 60 } as const;

const rateLimitResponse = (resetEpoch: number, metadata: Record<string, unknown>) => {
  const retryAfter = Math.max(resetEpoch - Math.floor(Date.now() / 1000), 1);
  logWarn("rate.limit", { ...metadata, retryAfter });
  return errorResponse("ERR_RATE_LIMIT", "Rate limit exceeded", 429, {
    headers: {
      "Retry-After": retryAfter.toString()
    }
  });
};
