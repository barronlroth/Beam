import { errorResponse, jsonResponse } from "./utils";
import type { Env } from "./types";
import { registerDevice } from "./routes/devices";

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
    handler: async (_req, _env, _ctx, params) =>
      errorResponse("ERR_UNIMPLEMENTED", `Inbox delivery not implemented for ${params.deviceId}`, 501)
  },
  {
    method: "GET",
    pattern: /^\/v1\/devices\/(?<deviceId>[A-Za-z0-9_-]+)\/pending$/,
    handler: async (_req, _env, _ctx, params) =>
      errorResponse("ERR_UNIMPLEMENTED", `Pending lookup not implemented for ${params.deviceId}`, 501)
  },
  {
    method: "POST",
    pattern: /^\/v1\/items\/(?<itemId>[A-Za-z0-9_-]+)\/ack$/,
    handler: async (_req, _env, _ctx, params) =>
      errorResponse("ERR_UNIMPLEMENTED", `ACK not implemented for ${params.itemId}`, 501)
  },
  {
    method: "POST",
    pattern: /^\/v1\/devices\/(?<deviceId>[A-Za-z0-9_-]+)\/rotate-key$/,
    handler: async (_req, _env, _ctx, params) =>
      errorResponse("ERR_UNIMPLEMENTED", `Rotate key not implemented for ${params.deviceId}`, 501)
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
      return await match.route.handler(request, env, ctx, match.params);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return errorResponse("ERR_WORKER_UNCAUGHT", message, 500);
    }
  }
};
