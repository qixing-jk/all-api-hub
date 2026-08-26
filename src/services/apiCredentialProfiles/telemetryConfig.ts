import type {
  ApiCredentialTelemetryCustomEndpoint,
  ApiCredentialTelemetryJsonPathMap,
} from "~/types/apiCredentialProfiles"

export type ApiCredentialTelemetryJsonPathField =
  keyof ApiCredentialTelemetryJsonPathMap

/** Canonical persisted fields supported by custom read-only telemetry mapping. */
export const API_CREDENTIAL_TELEMETRY_JSON_PATH_FIELDS = [
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
] as const satisfies readonly ApiCredentialTelemetryJsonPathField[]

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
 * Resolves a root-relative or absolute custom endpoint into a request target.
 */
export function resolveApiCredentialTelemetryRequestTarget(
  baseUrl: string,
  endpoint: string,
): { baseUrl: string; endpoint: string; isCrossOrigin: boolean } {
  const trimmed = endpoint.trim()
  if (!trimmed) throw new Error("Custom endpoint is empty")
  if (trimmed.startsWith("//")) {
    throw new Error("Custom endpoint must not be protocol-relative")
  }

  const profileBaseUrl = new URL(baseUrl)
  const resolved = trimmed.startsWith("/")
    ? new URL(trimmed, profileBaseUrl.origin)
    : new URL(trimmed)

  if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
    throw new Error("Custom endpoint must use HTTP(S)")
  }

  return {
    baseUrl: resolved.origin,
    endpoint: `${resolved.pathname}${resolved.search}`,
    isCrossOrigin: resolved.origin !== profileBaseUrl.origin,
  }
}

/**
 * Accepts root-relative paths or absolute HTTP(S) telemetry URLs.
 */
export function isSupportedApiCredentialTelemetryEndpoint(
  baseUrl: string,
  endpoint: string,
): boolean {
  try {
    resolveApiCredentialTelemetryRequestTarget(baseUrl, endpoint)
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
  const bearerToken =
    typeof obj.bearerToken === "string" && obj.bearerToken.trim()
      ? obj.bearerToken.trim()
      : ""
  const jsonPaths = coerceApiCredentialTelemetryJsonPathMap(obj.jsonPaths)

  if (
    !endpoint ||
    Object.keys(jsonPaths).length === 0 ||
    (baseUrl && !isSupportedApiCredentialTelemetryEndpoint(baseUrl, endpoint))
  ) {
    return undefined
  }

  return {
    endpoint,
    ...(bearerToken ? { bearerToken } : {}),
    jsonPaths,
  }
}
