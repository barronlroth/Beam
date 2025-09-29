export const JSON_HEADERS = {
  "content-type": "application/json"
} as const;

export const jsonResponse = (data: unknown, init: ResponseInit = {}): Response => {
  const headers = new Headers(init.headers);
  headers.set("content-type", JSON_HEADERS["content-type"]);
  return new Response(JSON.stringify(data), { ...init, headers });
};

export type ErrorCode =
  | "ERR_ROUTER_NOT_FOUND"
  | "ERR_ROUTER_METHOD"
  | "ERR_UNIMPLEMENTED"
  | "ERR_WORKER_UNCAUGHT"
  | "ERR_BODY_PARSE"
  | "ERR_VALIDATION"
  | "ERR_INBOX_UNAUTHORIZED"
  | "ERR_INBOX_UNKNOWN_DEVICE"
  | "ERR_ACK_UNKNOWN_ITEM";

export const errorResponse = (code: ErrorCode, message: string, status: number): Response =>
  jsonResponse({ error: { code, message } }, { status });

export const safeJson = async <T>(request: Request): Promise<T | Response> => {
  try {
    return (await request.json()) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON";
    return errorResponse("ERR_BODY_PARSE", message, 400);
  }
};

export const requiredString = (value: unknown, label: string): string | null => {
  if (typeof value !== "string" || value.trim().length === 0) {
    return `${label} must be a non-empty string`;
  }
  return null;
};

export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const encoder = new TextEncoder();

export const sha256Hex = async (input: string): Promise<string> => {
  const data = encoder.encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

export const validateHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};
