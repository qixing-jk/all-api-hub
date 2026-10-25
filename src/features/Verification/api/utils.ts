/**
 * Format probe latency for display.
 * Renders in milliseconds below 1000ms (e.g. 150ms), and in seconds with
 * one decimal point for larger durations (e.g. 1.2s, 15s).
 */
export function formatLatency(latencyMs: number | null | undefined): string {
  if (
    typeof latencyMs !== "number" ||
    !Number.isFinite(latencyMs) ||
    latencyMs <= 0
  ) {
    return "-"
  }
  if (latencyMs < 1000) {
    return `${Math.round(latencyMs)}ms`
  }
  const seconds = latencyMs / 1000
  if (seconds < 10) {
    return `${parseFloat(seconds.toFixed(1))}s`
  }
  return `${Math.round(seconds)}s`
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
