/**
 * Format latency for display.
 */
export function formatLatency(latencyMs: number) {
  if (!Number.isFinite(latencyMs) || latencyMs <= 0) return "-"
  return `${Math.round(latencyMs)}ms`
}

/**
 * Stringify an unknown value for display in the UI.
 * Falls back to a best-effort string when the value is not JSON-serializable.
 */
export function safeJsonStringify(value: unknown): string {
  if (value === undefined) return ""
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}
