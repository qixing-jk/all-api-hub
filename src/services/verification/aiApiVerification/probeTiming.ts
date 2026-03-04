/**
 * Get current timestamp in milliseconds.
 */
export function nowMs() {
  return Date.now()
}

/**
 * Compute a non-negative latency based on the provided start timestamp.
 */
export function okLatency(startedAt: number) {
  return Math.max(0, nowMs() - startedAt)
}
