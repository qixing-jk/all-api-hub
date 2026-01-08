import { getErrorMessage } from "~/utils/error"

/**
 * Redact any known secret strings from a message.
 */
export function redactSecrets(text: string, secrets: string[]): string {
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
 * Infer an HTTP status code from a thrown error object and/or a sanitized message.
 *
 * The AI SDK may throw different error shapes depending on provider/version, so we
 * check a few common fields before falling back to parsing the message text.
 */
export function inferHttpStatus(
  error: unknown,
  sanitizedMessage: string,
): number | undefined {
  if (error && typeof error === "object") {
    const anyErr = error as any
    const candidates = [
      anyErr.status,
      anyErr.statusCode,
      anyErr.response?.status,
      anyErr.cause?.status,
      anyErr.cause?.statusCode,
    ]
    for (const value of candidates) {
      if (typeof value === "number" && Number.isFinite(value)) return value
      if (typeof value === "string") {
        const parsed = Number(value)
        if (Number.isFinite(parsed)) return parsed
      }
    }
  }

  const match = sanitizedMessage.match(/\b(401|403|404|429|500|502|503)\b/)
  return match ? Number(match[1]) : undefined
}

/**
 * Normalize a user-supplied base URL to the `/v1` prefix used by OpenAI-compatible APIs.
 */
export function coerceBaseUrlToV1(baseUrl: string): string {
  const trimmed = baseUrl.trim()
  if (!trimmed) return trimmed

  try {
    const url = new URL(trimmed)
    const pathname = url.pathname.replace(/\/+$/, "")
    if (pathname.endsWith("/v1")) {
      url.pathname = pathname
      return url.toString().replace(/\/+$/, "")
    }

    url.pathname = `${pathname}/v1`.replace(/\/{2,}/g, "/")
    return url.toString().replace(/\/+$/, "")
  } catch {
    return trimmed.replace(/\/+$/, "")
  }
}

/**
 * Normalize a user-supplied base URL to the `/v1` prefix used by Anthropic APIs.
 */
export function coerceBaseUrlToAnthropicV1(baseUrl: string): string {
  const trimmed = baseUrl.trim()
  if (!trimmed) return trimmed

  try {
    const url = new URL(trimmed)
    const pathname = url.pathname.replace(/\/+$/, "")
    if (pathname.endsWith("/v1")) {
      url.pathname = pathname
      return url.toString().replace(/\/+$/, "")
    }

    url.pathname = `${pathname}/v1`.replace(/\/{2,}/g, "/")
    return url.toString().replace(/\/+$/, "")
  } catch {
    return trimmed.replace(/\/+$/, "")
  }
}

/**
 * Normalize a user-supplied base URL to the `/v1beta` prefix used by Google/Gemini APIs.
 */
export function coerceBaseUrlToGoogleV1beta(baseUrl: string): string {
  const trimmed = baseUrl.trim()
  if (!trimmed) return trimmed

  try {
    const url = new URL(trimmed)
    const pathname = url.pathname.replace(/\/+$/, "")
    if (pathname.endsWith("/v1beta")) {
      url.pathname = pathname
      return url.toString().replace(/\/+$/, "")
    }

    url.pathname = `${pathname}/v1beta`.replace(/\/{2,}/g, "/")
    return url.toString().replace(/\/+$/, "")
  } catch {
    return trimmed.replace(/\/+$/, "")
  }
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
