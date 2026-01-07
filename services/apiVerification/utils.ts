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
