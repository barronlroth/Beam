import { errorResponse, jsonResponse } from "./utils";
import type { Env } from "./types";
import { registerDevice } from "./routes/devices";
import { enqueueToInbox } from "./routes/inbox";
import { acknowledgeItem } from "./routes/ack";
import { listPending } from "./routes/pending";
import { rotateKey } from "./routes/rotate";
import { logError, logInfo, redactHeaders } from "./logger";

type RouteHandler = (
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  params: Record<string, string>
) => Promise<Response> | Response;

interface Route {
  method: string;
  pattern: RegExp;
  handler: RouteHandler;
}

const routes: Route[] = [
  {
    method: "POST",
    pattern: /^\/v1\/devices$/,
    handler: (request, env, _ctx, _params) => registerDevice(request, env)
  },
  {
    method: "POST",
    pattern: /^\/v1\/inbox\/(?<deviceId>[A-Za-z0-9_-]+)$/,
    handler: (request, env, _ctx, params) => enqueueToInbox(request, env, params.deviceId)
  },
  {
    method: "GET",
    pattern: /^\/v1\/devices\/(?<deviceId>[A-Za-z0-9_-]+)\/pending$/,
    handler: (request, env, _ctx, params) => listPending(request, env, params.deviceId)
  },
  {
    method: "POST",
    pattern: /^\/v1\/items\/(?<itemId>[A-Za-z0-9_-]+)\/ack$/,
    handler: (request, env, _ctx, params) => acknowledgeItem(request, env, params.itemId)
  },
  {
    method: "POST",
    pattern: /^\/v1\/devices\/(?<deviceId>[A-Za-z0-9_-]+)\/rotate-key$/,
    handler: (request, env, _ctx, params) => rotateKey(request, env, params.deviceId)
  },
  {
    method: "GET",
    pattern: /^\/healthz$/,
    handler: async () => jsonResponse({ ok: true, service: "beam-lite-worker" })
  }
];

const matchRoute = (method: string, pathname: string): { route: Route; params: Record<string, string> } | undefined => {
  for (const route of routes) {
    if (route.method !== method) continue;
    const match = pathname.match(route.pattern);
    if (match) {
      return { route, params: match.groups ?? {} };
    }
  }
  return undefined;
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const requestId = crypto.randomUUID();
    const baseMetadata = {
      requestId,
      method: request.method,
      path: url.pathname
    } as const;

    logInfo("http.request", baseMetadata);

    if (!url.pathname.startsWith("/v1") && url.pathname !== "/healthz") {
      return errorResponse("ERR_ROUTER_NOT_FOUND", "Not found", 404);
    }

    const match = matchRoute(request.method, url.pathname);
    if (!match) {
      if (routes.some((route) => route.pattern.test(url.pathname))) {
        return errorResponse("ERR_ROUTER_METHOD", "Method not allowed", 405);
      }
      return errorResponse("ERR_ROUTER_NOT_FOUND", "Not found", 404);
    }

    try {
      const response = await match.route.handler(request, env, ctx, match.params);
      return response;
    } catch (error) {
      logError("http.error", error, {
        ...baseMetadata,
        headers: redactHeaders(request.headers)
      });
      const message = error instanceof Error ? error.message : "Unknown error";
      return errorResponse("ERR_WORKER_UNCAUGHT", message, 500);
    }
  }
};
