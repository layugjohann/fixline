/**
 * Live-mode rate limits for runs on the shared free-tier key (ADR 0002): each
 * visitor gets a few live runs a day, and all visitors together get a fixed
 * number a day, so the free-tier quota is never used up. Runs on a visitor's
 * own key skip these limits entirely.
 *
 * Counts live in Upstash Redis (free tier) when it is configured, so they hold
 * across serverless instances. Without it (local development) they live in this
 * server process's memory.
 */
import { createHash } from "node:crypto";

/** Which limit refused a run: this visitor's daily allowance, or the demo's overall daily cap. */
export type LiveRunLimit = "visitor" | "global";

export type LiveRunAllowance =
  | { allowed: true }
  | { allowed: false; limit: LiveRunLimit; /** Seconds until the limit resets (midnight UTC). */ retryAfterSeconds: number };

/** Hands out shared-key live runs. */
export interface LiveRunLimiter {
  /** Count one live run for `visitor`, or refuse it if a limit is reached. */
  take(visitor: string, now?: Date): Promise<LiveRunAllowance>;
}

/** A store of counters that expire. */
export interface Counter {
  /** Add one to `key` and return its new value. A new key expires after `ttlSeconds`. */
  increment(key: string, ttlSeconds: number): Promise<number>;
}

/** The shared-key limits could not be checked (for example, Upstash is unreachable). Live runs on the shared key are refused. */
export class LiveRunLimiterUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("Live mode's rate limiter is unavailable right now.", { cause });
    this.name = "LiveRunLimiterUnavailableError";
  }
}

export interface DailyLimits {
  perVisitor: number;
  global: number;
}

export const DEFAULT_DAILY_LIMITS: DailyLimits = { perVisitor: 10, global: 100 };

const KEY_PREFIX = "fixline:live-runs";
// Counters outlive their UTC day a little, so a clock skew never resets one early.
const COUNTER_TTL_SECONDS = 26 * 60 * 60;

/**
 * Per-visitor and global daily caps, counted per UTC day. A visitor over their own
 * limit is refused without touching the global count, so one visitor can't use up
 * everyone's runs by retrying.
 */
export class DailyLiveRunLimiter implements LiveRunLimiter {
  constructor(
    private readonly counter: Counter,
    private readonly limits: DailyLimits = DEFAULT_DAILY_LIMITS,
  ) {}

  async take(visitor: string, now: Date = new Date()): Promise<LiveRunAllowance> {
    const day = now.toISOString().slice(0, 10);
    const retryAfterSeconds = secondsUntilNextUtcDay(now);
    try {
      const visitorRuns = await this.counter.increment(`${KEY_PREFIX}:${day}:visitor:${hashVisitor(visitor)}`, COUNTER_TTL_SECONDS);
      if (visitorRuns > this.limits.perVisitor) return { allowed: false, limit: "visitor", retryAfterSeconds };
      const globalRuns = await this.counter.increment(`${KEY_PREFIX}:${day}:global`, COUNTER_TTL_SECONDS);
      if (globalRuns > this.limits.global) return { allowed: false, limit: "global", retryAfterSeconds };
    } catch (error) {
      throw new LiveRunLimiterUnavailableError(error);
    }
    return { allowed: true };
  }
}

/** Counters in this process's memory. For tests and local development only: serverless instances don't share them. */
export class InMemoryCounter implements Counter {
  private readonly counts = new Map<string, { value: number; expiresAt: number }>();

  constructor(private readonly clock: () => number = Date.now) {}

  async increment(key: string, ttlSeconds: number): Promise<number> {
    const now = this.clock();
    const current = this.counts.get(key);
    const entry = current && current.expiresAt > now ? current : { value: 0, expiresAt: now + ttlSeconds * 1000 };
    entry.value += 1;
    this.counts.set(key, entry);
    return entry.value;
  }

  /** Every key currently held, for tests to inspect what is stored. */
  keys(): string[] {
    return [...this.counts.keys()];
  }
}

/** Counters in Upstash Redis, through its REST API. */
export class UpstashCounter implements Counter {
  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async increment(key: string, ttlSeconds: number): Promise<number> {
    const response = await this.fetchImpl(`${this.url.replace(/\/+$/, "")}/pipeline`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
      body: JSON.stringify([
        ["INCR", key],
        ["EXPIRE", key, String(ttlSeconds), "NX"],
      ]),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Upstash responded ${response.status}.`);
    const results: unknown = await response.json();
    const count = Array.isArray(results) ? (results[0] as { result?: unknown } | undefined)?.result : undefined;
    if (typeof count !== "number") throw new Error("Upstash returned an unexpected response.");
    return count;
  }
}

export type LimiterEnv = Readonly<Record<string, string | undefined>>;

/**
 * The limiter live mode uses: Upstash when UPSTASH_REDIS_REST_URL and
 * UPSTASH_REDIS_REST_TOKEN are set, otherwise in-memory counts. The caps default
 * to {@link DEFAULT_DAILY_LIMITS} and can be changed with FIXLINE_LIVE_RUNS_PER_VISITOR
 * and FIXLINE_LIVE_RUNS_PER_DAY.
 */
export function configuredLiveRunLimiter(env: LimiterEnv = process.env): LiveRunLimiter {
  const limits: DailyLimits = {
    perVisitor: positiveInteger(env.FIXLINE_LIVE_RUNS_PER_VISITOR) ?? DEFAULT_DAILY_LIMITS.perVisitor,
    global: positiveInteger(env.FIXLINE_LIVE_RUNS_PER_DAY) ?? DEFAULT_DAILY_LIMITS.global,
  };
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  const counter = url && token ? new UpstashCounter(url, token) : new InMemoryCounter();
  return new DailyLiveRunLimiter(counter, limits);
}

/**
 * Who a request comes from, for the per-visitor limit: the client address the
 * hosting platform reports. Vercel sets these headers itself, so clients can't spoof them there.
 */
export function visitorOf(request: Request): string {
  const realIp = request.headers.get("x-real-ip")?.trim();
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return realIp || forwarded || "unknown";
}

/** Visitors are stored only as a one-way hash, never as their address. */
function hashVisitor(visitor: string): string {
  return createHash("sha256").update(visitor).digest("hex").slice(0, 32);
}

function secondsUntilNextUtcDay(now: Date): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}

function positiveInteger(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
