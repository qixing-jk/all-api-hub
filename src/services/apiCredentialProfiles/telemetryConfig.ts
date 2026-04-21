import type {
  ApiCredentialTelemetryCustomEndpoint,
  ApiCredentialTelemetryJsonPathMap,
} from "~/types/apiCredentialProfiles"

export type ApiCredentialTelemetryJsonPathField =
  keyof ApiCredentialTelemetryJsonPathMap

const API_CREDENTIAL_TELEMETRY_JSON_PATH_FIELDS: ApiCredentialTelemetryJsonPathField[] =
  [
    "balanceUsd",
    "todayCostUsd",
    "todayRequests",
    "todayPromptTokens",
    "todayCompletionTokens",
    "todayTotalTokens",
    "totalUsedUsd",
    "totalGrantedUsd",
    "totalAvailableUsd",
    "expiresAt",
  ]

/**
 * Accepts the simple dot-path format supported by custom telemetry mapping.
 */
function isSupportedApiCredentialTelemetryJsonPath(path: string): boolean {
  const segments = path.split(".").map((segment) => segment.trim())
  return segments.length > 0 && segments.every(Boolean)
}

/**
 * Normalizes whitespace inside dot-separated JSON paths before persistence.
 */
function normalizeApiCredentialTelemetryJsonPath(path: string): string {
  return path
    .split(".")
    .map((segment) => segment.trim())
    .join(".")
}

/**
 * Trims and drops empty custom telemetry JSON path mappings before save.
 */
export function coerceApiCredentialTelemetryJsonPathMap(
  raw: unknown,
): ApiCredentialTelemetryJsonPathMap {
  const obj =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  const out: ApiCredentialTelemetryJsonPathMap = {}

  for (const key of API_CREDENTIAL_TELEMETRY_JSON_PATH_FIELDS) {
    const value = obj[key]
    if (typeof value !== "string" || !value.trim()) continue

    const normalized = normalizeApiCredentialTelemetryJsonPath(value)
    if (isSupportedApiCredentialTelemetryJsonPath(normalized)) {
      out[key] = normalized
    }
  }

  return out
}

/**
 * Resolves a custom endpoint while keeping it on the profile origin.
 */
export function resolveApiCredentialTelemetryEndpoint(
  baseUrl: string,
  endpoint: string,
): string {
  const trimmed = endpoint.trim()
  if (!trimmed) throw new Error("Custom endpoint is empty")

  const profileBaseUrl = new URL(baseUrl)
  const resolved = trimmed.startsWith("/")
    ? new URL(trimmed, profileBaseUrl.origin)
    : new URL(trimmed)

  if (resolved.origin !== profileBaseUrl.origin) {
    throw new Error("Custom endpoint must stay on the profile base URL origin")
  }

  if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
    throw new Error("Custom endpoint must use HTTP(S)")
  }

  return `${resolved.pathname}${resolved.search}`
}

/**
 * Accepts only root-relative paths or same-origin HTTP(S) telemetry URLs.
 */
export function isSupportedApiCredentialTelemetryEndpoint(
  baseUrl: string,
  endpoint: string,
): boolean {
  try {
    resolveApiCredentialTelemetryEndpoint(baseUrl, endpoint)
    return true
  } catch {
    return false
  }
}

/**
 * Coerces custom endpoint telemetry config into a usable persisted shape.
 */
export function coerceApiCredentialTelemetryCustomEndpoint(
  raw: unknown,
  baseUrl?: string,
): ApiCredentialTelemetryCustomEndpoint | undefined {
  const obj =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  const endpoint =
    typeof obj.endpoint === "string" && obj.endpoint.trim()
      ? obj.endpoint.trim()
      : ""
  const jsonPaths = coerceApiCredentialTelemetryJsonPathMap(obj.jsonPaths)

  if (
    !endpoint ||
    Object.keys(jsonPaths).length === 0 ||
    (baseUrl && !isSupportedApiCredentialTelemetryEndpoint(baseUrl, endpoint))
  ) {
    return undefined
  }

  return { endpoint, jsonPaths }
}
