const REDACTED_HEADERS = new Set(["x-inbox-key", "authorization"]);

type LogLevel = "info" | "warn" | "error";

interface LogPayload {
  level: LogLevel;
  event: string;
  metadata?: Record<string, unknown>;
  error?: string;
}

const emit = (payload: LogPayload) => {
  const entry = {
    timestamp: new Date().toISOString(),
    ...payload
  };

  if (payload.level === "error") {
    console.error(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
};

export const redactHeaders = (headers: Headers): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const [key, value] of headers.entries()) {
    if (REDACTED_HEADERS.has(key.toLowerCase())) {
      result[key.toLowerCase()] = "REDACTED";
    } else {
      result[key.toLowerCase()] = value;
    }
  }
  return result;
};

export const logInfo = (event: string, metadata?: Record<string, unknown>) => {
  emit({ level: "info", event, metadata });
};

export const logWarn = (event: string, metadata?: Record<string, unknown>) => {
  emit({ level: "warn", event, metadata });
};

export const logError = (event: string, error: unknown, metadata?: Record<string, unknown>) => {
  const message = error instanceof Error ? error.message : String(error);
  emit({ level: "error", event, error: message, metadata });
};
