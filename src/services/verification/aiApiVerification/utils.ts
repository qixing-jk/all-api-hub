import { getErrorMessage } from "~/utils/core/error"
import { coerceBaseUrlToPathSuffix } from "~/utils/core/url"

/**
 * Redact any known secret strings from a message.
 */
function redactSecrets(text: string, secrets: string[]): string {
  if (!text) return ""

  return secrets
    .filter(Boolean)
    .reduce((acc, secret) => acc.split(secret).join("[REDACTED]"), text)
}

/**
 * Convert an unknown error into a safe, user-displayable summary.
 */
export function toSanitizedErrorSummary(
  error: unknown,
  secretsToRedact: string[],
): string {
  const raw = getErrorMessage(error)
  return redactSecrets(raw, secretsToRedact)
}

/**
 * Identify caller-initiated cancellation before probe error fallbacks convert it
 * into a failed verification result.
 */
export function isAbortError(
  error: unknown,
  abortSignal?: AbortSignal,
): boolean {
  if (abortSignal?.aborted) return true
  if (!error || typeof error !== "object") return false

  const candidate = error as { code?: unknown; name?: unknown }
  return candidate.name === "AbortError" || candidate.code === "ABORT_ERR"
}

/**
 * Map inferred HTTP status to a stable i18n summary key.
 *
 * These keys are shared between verification UIs (API verification + CLI support verification).
 */
export function summaryKeyFromHttpStatus(
  status: number | undefined,
): string | undefined {
  if (status === 401) return "verifyDialog.summaries.unauthorized"
  if (status === 403) return "verifyDialog.summaries.forbidden"
  if (status === 404) return "verifyDialog.summaries.endpointNotFound"
  return undefined
}

/**
 * Build safe, structured failure diagnostics for UI copy and analytics.
 *
 * `summaryKey` may use a status parsed from the sanitized message for better
 * local UI feedback, but `output.inferredHttpStatus` only uses structured error
 * fields so analytics does not depend on provider text.
 */
export function buildSafeProbeFailureDiagnostics(
  error: unknown,
  sanitizedMessage: string,
) {
  const displayStatus = inferHttpStatus(error, sanitizedMessage)
  const analyticsStatus = inferStructuredHttpStatus(error)

  return {
    summaryKey: summaryKeyFromHttpStatus(displayStatus),
    summaryParams:
      typeof displayStatus === "number" ? { status: displayStatus } : undefined,
    output:
      typeof analyticsStatus === "number"
        ? { inferredHttpStatus: analyticsStatus }
        : undefined,
  }
}

/** Reads valid HTTP status integers from structured status fields. */
function readFiniteStatus(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value) && value >= 100 && value <= 599
      ? value
      : undefined
  }
  if (typeof value === "string") {
    const parsed = Number(value)
    if (Number.isInteger(parsed) && parsed >= 100 && parsed <= 599) {
      return parsed
    }
  }
  return undefined
}

/** Narrows object-like values before inspecting known metadata fields. */
function readObjectRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined
}

/**
 * Infer an HTTP status code only from structured error metadata.
 *
 * Use this for analytics-facing diagnostics so provider/user text cannot change
 * the coarse failure category.
 */
export function inferStructuredHttpStatus(error: unknown): number | undefined {
  const errorRecord = readObjectRecord(error)
  if (!errorRecord) return undefined

  const directStatus =
    readFiniteStatus(errorRecord.status) ??
    readFiniteStatus(errorRecord.statusCode)
  if (typeof directStatus === "number") return directStatus

  const responseRecord = readObjectRecord(errorRecord.response)
  const responseStatus =
    readFiniteStatus(responseRecord?.status) ??
    readFiniteStatus(responseRecord?.statusCode)
  if (typeof responseStatus === "number") return responseStatus

  if (errorRecord.cause && errorRecord.cause !== error) {
    return inferStructuredHttpStatus(errorRecord.cause)
  }

  return undefined
}

/**
 * Infer an HTTP status code from a thrown error object and/or a sanitized message.
 *
 * The AI SDK may throw different error shapes depending on provider/version, so we
 * check a few common fields before falling back to parsing the message text.
 */
export function inferHttpStatus(
  error: unknown,
  sanitizedMessage: string,
): number | undefined {
  const structuredStatus = inferStructuredHttpStatus(error)
  if (typeof structuredStatus === "number") return structuredStatus

  const match = sanitizedMessage.match(/\b(401|403|404|429|500|502|503)\b/)
  return match ? Number(match[1]) : undefined
}

/**
 * Normalize a user-supplied base URL to the `/v1` prefix used by OpenAI-compatible APIs.
 */
export function coerceBaseUrlToV1(baseUrl: string): string {
  return coerceBaseUrlToPathSuffix(baseUrl, "/v1")
}

/**
 * Normalize a user-supplied base URL to the `/v1` prefix used by Anthropic APIs.
 */
export function coerceBaseUrlToAnthropicV1(baseUrl: string): string {
  return coerceBaseUrlToPathSuffix(baseUrl, "/v1")
}

/**
 * Normalize a user-supplied base URL to the `/v1beta` prefix used by Google/Gemini APIs.
 */
export function coerceBaseUrlToGoogleV1beta(baseUrl: string): string {
  return coerceBaseUrlToPathSuffix(baseUrl, "/v1beta")
}

/**
 * Best-effort model id guess based on token-provided model fields.
 */
export function guessModelIdFromToken(token: {
  models?: string
  model_limits?: string
}): string | undefined {
  const candidates = [token.models, token.model_limits]
    .filter(
      (value): value is string =>
        typeof value === "string" && value.trim().length > 0,
    )
    .flatMap((value) => value.split(/[, \n]+/g))
    .map((value) => value.trim())
    .filter(Boolean)

  return candidates[0]
}
