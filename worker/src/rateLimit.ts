import type { Env } from "./types";

const RATE_PREFIX = "rate";

interface BucketState {
  count: number;
  reset: number; // epoch seconds
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

const rateKey = (identifier: string) => `${RATE_PREFIX}:${identifier}`;

export interface RateLimitOptions {
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  reset: number;
}

export const checkRateLimit = async (
  env: Env,
  identifier: string,
  options: RateLimitOptions
): Promise<RateLimitResult> => {
  const key = rateKey(identifier);
  const { limit, windowSeconds } = options;
  const now = nowSeconds();

  const raw = await env.BEAM_KV.get(key);
  let state: BucketState | null = null;
  if (raw) {
    try {
      state = JSON.parse(raw) as BucketState;
    } catch {
      state = null;
    }
  }

  if (!state || state.reset <= now) {
    const reset = now + windowSeconds;
    const nextState: BucketState = { count: 1, reset };
    await env.BEAM_KV.put(key, JSON.stringify(nextState), { expirationTtl: windowSeconds });
    return { allowed: true, remaining: limit - 1, reset };
  }

  if (state.count >= limit) {
    return { allowed: false, remaining: 0, reset: state.reset };
  }

  const nextState: BucketState = {
    count: state.count + 1,
    reset: state.reset
  };

  await env.BEAM_KV.put(key, JSON.stringify(nextState), { expirationTtl: Math.max(state.reset - now, 1) });
  return { allowed: true, remaining: Math.max(limit - nextState.count, 0), reset: state.reset };
};
