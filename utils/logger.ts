import { USER_PREFERENCES_STORAGE_KEYS } from "~/services/storageKeys"
import type { LoggingPreferences, LogLevel } from "~/types/logging"
import { getDefaultLoggingPreferences } from "~/types/logging"
import { sanitizeUrlForLog } from "~/utils/sanitizeUrlForLog"

export type ExtensionLogContext =
  | "Background"
  | "Content"
  | "Popup"
  | "Options"
  | "SidePanel"
  | "Unknown"

export interface Logger {
  debug: (message: string, details?: unknown) => void
  info: (message: string, details?: unknown) => void
  warn: (message: string, details?: unknown) => void
  error: (message: string, details?: unknown) => void
}

const LOG_LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
} as const

const REDACTED_PLACEHOLDER = "[REDACTED]"
const CIRCULAR_PLACEHOLDER = "[Circular]"

const SENSITIVE_KEY_MATCHERS: readonly RegExp[] = [
  /^token$/i,
  /^access[_-]?token$/i,
  /^refresh[_-]?token$/i,
  /^admin[_-]?token$/i,
  /^api[_-]?key$/i,
  /^key$/i,
  /^authorization$/i,
  /^cookie$/i,
  /^set-cookie$/i,
  /sessioncookie/i,
  /^password$/i,
  /^passwd$/i,
  /^secret$/i,
  /^client[_-]?secret$/i,
  /^management[_-]?key$/i,
  /^backup/i,
] as const

const URL_LIKE_KEY = /url|uri|href|endpoint|origin/i

let currentContext: ExtensionLogContext = detectExtensionContext()
let currentPreferences: LoggingPreferences = getDefaultLoggingPreferences()

let unsubscribeStorageListener: (() => void) | null = null
let initialPreferenceLoadStarted = false

/**
 * Creates a scoped logger that emits leveled, prefixed logs to the browser console
 * when enabled via user preferences.
 *
 * The emitted prefix includes the standardized extension context (Background,
 * Content, Popup, Options, SidePanel) plus the provided scope.
 */
export function createLogger(scope: string): Logger {
  const normalizedScope = (scope || "").trim() || "Unknown"

  return {
    debug: (message, details) =>
      safeLog("debug", normalizedScope, message, details),
    info: (message, details) =>
      safeLog("info", normalizedScope, message, details),
    warn: (message, details) =>
      safeLog("warn", normalizedScope, message, details),
    error: (message, details) =>
      safeLog("error", normalizedScope, message, details),
  }
}

/**
 * Override the detected extension context used in log prefixes.
 */
export function setLoggerContext(context: ExtensionLogContext) {
  currentContext = context
}

/**
 *
 */
export function getLoggerContext(): ExtensionLogContext {
  return currentContext
}

/**
 *
 */
export function getLoggingPreferences(): LoggingPreferences {
  return currentPreferences
}

/**
 * Replace the current logging preferences.
 */
export function setLoggingPreferences(preferences: LoggingPreferences) {
  currentPreferences = preferences
}

/**
 * Merge updates into the current logging preferences.
 */
export function updateLoggingPreferences(updates: Partial<LoggingPreferences>) {
  currentPreferences = { ...currentPreferences, ...updates }
}

/**
 * Starts listening for user-preference changes in browser storage so logging
 * preferences take effect without restarting the extension.
 *
 * Returns a cleanup function (no-op if storage APIs are unavailable).
 */
export function startLoggingPreferenceSync(): () => void {
  if (unsubscribeStorageListener) return unsubscribeStorageListener

  const api = getExtensionApi()
  const onChanged = api?.storage?.onChanged
  if (!onChanged?.addListener || !onChanged?.removeListener) {
    unsubscribeStorageListener = () => {}
    return unsubscribeStorageListener
  }

  const listener = (
    changes: Record<string, { newValue?: unknown }> | undefined,
    areaName?: string,
  ) => {
    if (areaName && areaName !== "local") return
    const change = changes?.[USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES]
    if (!change) return
    applyPreferencesFromStoredValue(change.newValue)
  }

  onChanged.addListener(listener)
  unsubscribeStorageListener = () => onChanged.removeListener(listener)
  return unsubscribeStorageListener
}

/**
 * Loads initial logging preferences from storage once.
 *
 * This is best-effort and never throws; defaults are used if the preference
 * payload is missing or invalid.
 */
export async function loadLoggingPreferencesFromStorageOnce(): Promise<void> {
  if (initialPreferenceLoadStarted) return
  initialPreferenceLoadStarted = true

  try {
    const stored = await storageLocalGet(
      USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
    )
    applyPreferencesFromStoredValue(stored)
  } catch {
    // Ignore; defaults remain in effect.
  }
}

/**
 * Best-effort initialization that starts preference syncing and loads the
 * initial preference snapshot asynchronously.
 *
 * Safe to call multiple times.
 */
export function initializeLogging(): void {
  startLoggingPreferenceSync()
  void loadLoggingPreferencesFromStorageOnce()
}

/**
 *
 */
function safeLog(
  level: LogLevel,
  scope: string,
  message: string,
  details?: unknown,
) {
  try {
    if (!shouldEmit(level)) return

    const sink = getConsoleSink(level)
    if (!sink) return

    const prefix = formatPrefix(scope)
    const safeMessage = typeof message === "string" ? message : String(message)

    if (typeof details === "undefined") {
      sink(`${prefix} ${safeMessage}`)
      return
    }

    const safeDetails = sanitizeLogDetails(details)
    sink(`${prefix} ${safeMessage}`, safeDetails)
  } catch {
    // The logger must never throw to callers.
  }
}

/**
 *
 */
function shouldEmit(level: LogLevel): boolean {
  const preferences = currentPreferences
  if (!preferences.consoleEnabled) return false
  return LOG_LEVEL_RANK[level] >= LOG_LEVEL_RANK[preferences.level]
}

/**
 *
 */
function formatPrefix(scope: string): string {
  return `[${currentContext}][${scope}]`
}

/**
 *
 */
function getConsoleSink(
  level: LogLevel,
): ((...args: unknown[]) => void) | null {
  const consoleRef: any = (globalThis as any).console
  if (!consoleRef) return null

  if (level === "debug") {
    return typeof consoleRef.debug === "function"
      ? consoleRef.debug.bind(consoleRef)
      : typeof consoleRef.log === "function"
        ? consoleRef.log.bind(consoleRef)
        : null
  }

  if (level === "info") {
    return typeof consoleRef.info === "function"
      ? consoleRef.info.bind(consoleRef)
      : typeof consoleRef.log === "function"
        ? consoleRef.log.bind(consoleRef)
        : null
  }

  if (level === "warn") {
    return typeof consoleRef.warn === "function"
      ? consoleRef.warn.bind(consoleRef)
      : null
  }

  return typeof consoleRef.error === "function"
    ? consoleRef.error.bind(consoleRef)
    : null
}

/**
 *
 */
function sanitizeLogDetails(details: unknown): unknown {
  try {
    const seen = new WeakMap<object, unknown>()
    return sanitizeValue(details, undefined, seen)
  } catch {
    return "[Unserializable]"
  }
}

/**
 *
 */
function sanitizeValue(
  value: unknown,
  keyHint: string | undefined,
  seen: WeakMap<object, unknown>,
): unknown {
  if (typeof keyHint === "string" && isSensitiveKey(keyHint)) {
    return REDACTED_PLACEHOLDER
  }

  if (typeof value === "string") {
    if (typeof keyHint === "string" && URL_LIKE_KEY.test(keyHint)) {
      return sanitizeUrlForLog(value)
    }
    if (/^https?:\/\//i.test(value)) {
      return sanitizeUrlForLog(value)
    }
    return value
  }

  if (
    value == null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value
  }

  if (typeof value === "bigint") {
    return value.toString()
  }

  if (typeof value === "symbol") {
    return value.toString()
  }

  if (typeof value === "function") {
    return `[Function${value.name ? `: ${value.name}` : ""}]`
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (value instanceof URL) {
    return sanitizeUrlForLog(value.toString())
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    }
  }

  if (typeof value !== "object") {
    return String(value)
  }

  const obj = value as object
  if (seen.has(obj)) return CIRCULAR_PLACEHOLDER
  seen.set(obj, true)

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, undefined, seen))
  }

  if (value instanceof Map) {
    return Array.from(value.entries()).map(([k, v]) => [
      sanitizeValue(k, undefined, seen),
      sanitizeValue(v, undefined, seen),
    ])
  }

  if (value instanceof Set) {
    return Array.from(value.values()).map((v) =>
      sanitizeValue(v, undefined, seen),
    )
  }

  const output: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    output[k] = sanitizeValue(v, k, seen)
  }

  return output
}

/**
 *
 */
function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_MATCHERS.some((matcher) => matcher.test(key))
}

/**
 *
 */
function applyPreferencesFromStoredValue(stored: unknown) {
  try {
    const maybePrefs = stored as any
    const logging = maybePrefs?.logging as
      | Partial<LoggingPreferences>
      | undefined
    if (!logging) {
      currentPreferences = getDefaultLoggingPreferences()
      return
    }

    const consoleEnabled =
      typeof logging.consoleEnabled === "boolean"
        ? logging.consoleEnabled
        : getDefaultLoggingPreferences().consoleEnabled

    const level = isLogLevel(logging.level)
      ? logging.level
      : getDefaultLoggingPreferences().level

    currentPreferences = { consoleEnabled, level }
  } catch {
    currentPreferences = getDefaultLoggingPreferences()
  }
}

/**
 *
 */
function isLogLevel(value: unknown): value is LogLevel {
  return (
    value === "debug" ||
    value === "info" ||
    value === "warn" ||
    value === "error"
  )
}

/**
 *
 */
function detectExtensionContext(): ExtensionLogContext {
  try {
    const api = getExtensionApi()
    const hasRuntime = Boolean(api?.runtime)

    const hasDocument = typeof document !== "undefined"
    if (hasRuntime && !hasDocument) return "Background"

    const protocol = globalThis.location?.protocol ?? ""
    const isExtensionPage =
      protocol === "chrome-extension:" ||
      protocol === "moz-extension:" ||
      protocol === "ms-browser-extension:"

    if (!hasRuntime) return "Unknown"
    if (!hasDocument) return "Unknown"

    if (!isExtensionPage) return "Content"

    const path = (globalThis.location?.pathname ?? "").toLowerCase()
    if (path.includes("options")) return "Options"
    if (path.includes("sidepanel")) return "SidePanel"
    if (path.includes("popup")) return "Popup"

    return "Popup"
  } catch {
    return "Unknown"
  }
}

/**
 *
 */
function getExtensionApi(): any {
  return (globalThis as any).browser ?? (globalThis as any).chrome ?? null
}

/**
 *
 */
async function storageLocalGet(key: string): Promise<unknown> {
  const api = getExtensionApi()
  const storageLocal = api?.storage?.local
  if (!storageLocal?.get) return null

  try {
    const maybePromise = storageLocal.get(key)
    if (maybePromise && typeof maybePromise.then === "function") {
      const result = await maybePromise
      return (result as any)?.[key] ?? null
    }
  } catch {
    // Fall through to callback form.
  }

  return await new Promise((resolve) => {
    try {
      storageLocal.get(key, (result: any) => resolve(result?.[key] ?? null))
    } catch {
      resolve(null)
    }
  })
}

// Initialize immediately for the common case (safe in tests/non-extension envs).
initializeLogging()
