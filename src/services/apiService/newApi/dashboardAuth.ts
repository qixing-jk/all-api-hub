export const NEW_API_DASHBOARD_AUTH_REFRESH_PATH = "/api/user/auth/refresh"

export const NEW_API_DASHBOARD_AUTH_INVALID_RESPONSE =
  "New API dashboard session response is invalid"

const AUTH_BUNDLE_TOKEN_FIELDS = [
  "access_token",
  "token_type",
  "access_expires_at",
] as const

type UnknownRecord = Record<string, unknown>

export interface NewApiDashboardAuthBundle {
  token: string
  expiresAt: number
  sessionId: string
  user: UnknownRecord
}

type NewApiDashboardAuthBundleParseResult =
  | { kind: "valid"; bundle: NewApiDashboardAuthBundle }
  | { kind: "malformed" }
  | { kind: "unrelated" }

/** Checks that an unknown JSON value is a plain object record. */
function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

/** Returns a trimmed string only when the unknown value is nonblank. */
function getNonBlankString(value: unknown): string | null {
  if (typeof value !== "string") return null

  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

/** Detects whether a response attempted the modern New API AuthBundle shape. */
function isRecognizableAuthBundleAttempt(data: unknown): boolean {
  if (!isRecord(data)) return false

  const hasTokenMarker = AUTH_BUNDLE_TOKEN_FIELDS.some((field) =>
    Object.prototype.hasOwnProperty.call(data, field),
  )
  if (hasTokenMarker) return true

  const session = data.session
  return Boolean(
    isRecord(session) &&
      (Object.prototype.hasOwnProperty.call(session, "sid") ||
        Object.prototype.hasOwnProperty.call(session, "current")),
  )
}

/**
 * Validates the modern dashboard AuthBundle without applying account identity
 * rules. Callers keep the returned credential process-local and transient.
 *
 * Upstream contract:
 * https://github.com/QuantumNous/new-api/commit/31d70fca393ff2e09bbae012af2e3ccefdd389a1
 */
export function parseNewApiDashboardAuthBundleResponse(
  body: unknown,
  nowMs: number = Date.now(),
): NewApiDashboardAuthBundleParseResult {
  const data = isRecord(body) ? body.data : undefined
  const recognizable = isRecognizableAuthBundleAttempt(data)

  if (!isRecord(body) || body.success !== true || !isRecord(data)) {
    return recognizable ? { kind: "malformed" } : { kind: "unrelated" }
  }

  const token = getNonBlankString(data.access_token)
  const expiresAt = data.access_expires_at
  const session = data.session
  const sessionId = isRecord(session) ? getNonBlankString(session.sid) : null

  if (
    data.token_type !== "Bearer" ||
    !token ||
    typeof expiresAt !== "number" ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= nowMs / 1000 ||
    !isRecord(data.user) ||
    !isRecord(session) ||
    !sessionId ||
    session.current !== true
  ) {
    return recognizable ? { kind: "malformed" } : { kind: "unrelated" }
  }

  return {
    kind: "valid",
    bundle: {
      token,
      expiresAt,
      sessionId,
      user: data.user,
    },
  }
}
