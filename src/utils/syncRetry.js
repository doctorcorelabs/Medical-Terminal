const DEFAULT_BASE_DELAY_MS = 2_000;
const DEFAULT_MAX_DELAY_MS = 5 * 60_000;
const DEFAULT_JITTER_RATIO = 0.25;

function toFiniteNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export function computeRetryDelayMs(attemptCount, options = {}, randomFn = Math.random) {
    const baseDelayMs = Math.max(0, toFiniteNumber(options.baseDelayMs, DEFAULT_BASE_DELAY_MS));
    const maxDelayMs = Math.max(baseDelayMs, toFiniteNumber(options.maxDelayMs, DEFAULT_MAX_DELAY_MS));
    const jitterRatio = Math.max(0, toFiniteNumber(options.jitterRatio, DEFAULT_JITTER_RATIO));
    const attempts = Math.max(0, Math.trunc(toFiniteNumber(attemptCount, 0)));

    if (attempts <= 0) return 0;

    const exponent = Math.min(attempts - 1, 10);
    const backoff = Math.min(maxDelayMs, baseDelayMs * (2 ** exponent));
    const safeRandom = typeof randomFn === 'function' ? randomFn() : 0;
    const normalizedRandom = Number.isFinite(Number(safeRandom))
        ? Math.min(1, Math.max(0, Number(safeRandom)))
        : 0;
    const jitter = Math.floor(backoff * jitterRatio * normalizedRandom);
    return Math.min(maxDelayMs, backoff + jitter);
}

export function getQueueRetryState(item, options = {}, nowMs = Date.now(), randomFn = Math.random) {
    const attempts = Math.max(0, Math.trunc(toFiniteNumber(item?.attemptCount, 0)));
    const lastAttemptRaw = item?.lastAttemptAt;
    const lastAttemptMs = lastAttemptRaw ? Date.parse(lastAttemptRaw) : Number.NaN;

    if (attempts <= 0 || !Number.isFinite(lastAttemptMs)) {
        return {
            ready: true,
            waitMs: 0,
            delayMs: 0,
            attemptCount: attempts,
        };
    }

    const delayMs = computeRetryDelayMs(attempts, options, randomFn);
    const readyAtMs = lastAttemptMs + delayMs;
    const waitMs = Math.max(0, readyAtMs - nowMs);

    return {
        ready: waitMs === 0,
        waitMs,
        delayMs,
        attemptCount: attempts,
    };
}
