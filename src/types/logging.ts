/**
 * Logging preference model shared between the unified logger and the user
 * preferences system.
 *
 * This module centralizes the canonical log levels and default behavior so all
 * extension contexts apply the same policy (background, content, popup, options,
 * side panel, and tests).
 */

export type LogLevel = "debug" | "info" | "warn" | "error"

export const LOG_CONTEXTS = [
  "Background",
  "Content",
  "Popup",
  "Options",
  "SidePanel",
  "Unknown",
] as const
export type ExtensionLogContext = (typeof LOG_CONTEXTS)[number]

/** A bounded, credential-redacted local diagnostic entry. */
export interface LogHistoryEntry {
  id: string
  timestamp: number
  level: LogLevel
  context: ExtensionLogContext
  scope: string
  message: string
  details: string | null
}

/** Bound details before they cross an extension messaging boundary. */
export const LOG_HISTORY_DETAILS_LIMIT = 8000

export const LOG_LEVELS: readonly LogLevel[] = [
  "debug",
  "info",
  "warn",
  "error",
] as const

export interface LoggingPreferences {
  /**
   * Master switch for console logging and new local diagnostic history entries.
   *
   * When disabled, no logs are emitted or recorded at any level (including errors).
   */
  consoleEnabled: boolean

  /**
   * Minimum log level emitted and recorded when logging is enabled.
   */
  level: LogLevel
}

/**
 * Compute default logging preferences based on build mode.
 *
 * - development: enabled + verbose (`debug`)
 * - production: enabled (user can adjust via settings)
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

  return { consoleEnabled: true, level: "info" }
}
