/**
 * Logging preference model shared between the unified logger and the user
 * preferences system.
 *
 * This module centralizes the canonical log levels and default behavior so all
 * extension contexts apply the same policy (background, content, popup, options,
 * side panel, and tests).
 */

export type LogLevel = "debug" | "info" | "warn" | "error"

export const LOG_LEVELS: readonly LogLevel[] = [
  "debug",
  "info",
  "warn",
  "error",
] as const

export interface LoggingPreferences {
  /**
   * Master switch for console logging.
   *
   * When disabled, no log output is emitted at any level (including errors).
   */
  consoleEnabled: boolean

  /**
   * Minimum log level that will be emitted when console logging is enabled.
   */
  level: LogLevel
}

/**
 * Compute default logging preferences based on build mode.
 *
 * - development: enabled + verbose (`debug`)
 * - production: disabled (user can opt-in via settings)
 * - test: disabled by default to keep test output quiet (tests can override)
 */
export function getDefaultLoggingPreferences(
  mode: string = (import.meta as any)?.env?.MODE ?? "production",
): LoggingPreferences {
  if (mode === "development") {
    return { consoleEnabled: true, level: "debug" }
  }

  if (mode === "test") {
    return { consoleEnabled: false, level: "debug" }
  }

  return { consoleEnabled: false, level: "warn" }
}
