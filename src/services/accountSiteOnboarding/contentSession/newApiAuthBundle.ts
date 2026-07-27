import { SITE_TYPES } from "~/constants/siteType"
import { resolveStoredAccountUserIdentity } from "~/services/accounts/accountIdentity"

import {
  NEW_API_DASHBOARD_TRANSIENT_AUTH_KIND,
  type ContentSessionExtractionResult,
  type ContentSessionExtractor,
} from "../contracts"

const NEW_API_AUTH_REFRESH_PATH = "/api/user/auth/refresh"
const CONTROLLED_ERROR_STATUSES = new Set([401, 409, 429])
const AUTH_BUNDLE_TOKEN_FIELDS = [
  "access_token",
  "token_type",
  "access_expires_at",
] as const
const INVALID_AUTH_BUNDLE_ERROR =
  "New API dashboard session response is invalid"
const AUTH_REFRESH_REQUEST_ERROR = "New API session refresh request failed"

type UnknownRecord = Record<string, unknown>

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

/** Detects whether a successful response attempted the rc.22 AuthBundle shape. */
function isRecognizableAuthBundleAttempt(body: unknown): boolean {
  if (!isRecord(body) || !isRecord(body.data)) return false

  const hasTokenMarker = AUTH_BUNDLE_TOKEN_FIELDS.some((field) =>
    Object.prototype.hasOwnProperty.call(body.data, field),
  )
  if (hasTokenMarker) return true

  const session = body.data.session
  return Boolean(
    isRecord(session) &&
      (Object.prototype.hasOwnProperty.call(session, "sid") ||
        Object.prototype.hasOwnProperty.call(session, "current")),
  )
}

/** Validates and normalizes an rc.22 AuthBundle response. */
function parseAuthBundle(
  body: unknown,
  origin: string,
): ContentSessionExtractionResult | null {
  if (!isRecord(body) || body.success !== true || !isRecord(body.data)) {
    return null
  }

  const data = body.data
  const token = getNonBlankString(data.access_token)
  const expiresAt = data.access_expires_at
  if (
    data.token_type !== "Bearer" ||
    !token ||
    typeof expiresAt !== "number" ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= Date.now() / 1000
  ) {
    return null
  }

  const identity = resolveStoredAccountUserIdentity(
    data.user,
    SITE_TYPES.NEW_API,
  )
  if (!identity || !isRecord(data.session)) return null

  const sessionId = getNonBlankString(data.session.sid)
  if (!sessionId || data.session.current !== true) return null

  return {
    userId: identity.userId,
    user: identity.user,
    siteTypeHint: SITE_TYPES.NEW_API,
    transientAuth: {
      kind: NEW_API_DASHBOARD_TRANSIENT_AUTH_KIND,
      token,
      expiresAt,
      sessionId,
      origin,
    },
  }
}

/** Builds a status-only error without exposing the response body. */
function createRefreshStatusError(status: number): Error {
  return new Error(`New API session refresh failed (${status})`)
}

/** Builds a controlled error using only the response's safe public fields. */
async function createControlledRefreshError(
  response: Response,
): Promise<Error> {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    body = null
  }

  const code = isRecord(body) ? getNonBlankString(body.code) : null
  const message = isRecord(body) ? getNonBlankString(body.message) : null
  if (code && message) return new Error(`${code}: ${message}`)
  if (code) return new Error(code)
  if (message) return new Error(message)

  return createRefreshStatusError(response.status)
}

/**
 * Pinned rc.22 AuthBundle contract:
 * https://github.com/QuantumNous/new-api/blob/v1.0.0-rc.22/docs/authentication.md
 * https://github.com/QuantumNous/new-api/blob/v1.0.0-rc.22/controller/user.go
 */
async function extractNewApiAuthBundle(): Promise<ContentSessionExtractionResult | null> {
  const origin = location.origin
  let response: Response

  try {
    response = await fetch(`${origin}${NEW_API_AUTH_REFRESH_PATH}`, {
      credentials: "include",
      method: "POST",
    })
  } catch {
    throw new Error(AUTH_REFRESH_REQUEST_ERROR)
  }

  if (response.status === 404 || response.status === 405) return null
  if (!response.ok && CONTROLLED_ERROR_STATUSES.has(response.status)) {
    throw await createControlledRefreshError(response)
  }
  if (!response.ok) {
    throw createRefreshStatusError(response.status)
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new Error(INVALID_AUTH_BUNDLE_ERROR)
  }

  const result = parseAuthBundle(body, origin)
  if (result) return result
  if (isRecognizableAuthBundleAttempt(body)) {
    throw new Error(INVALID_AUTH_BUNDLE_ERROR)
  }

  return null
}

export const newApiAuthBundleContentSessionExtractor: ContentSessionExtractor =
  {
    id: "new-api-auth-bundle",
    canExtract: (context) => context.siteTypeHint === SITE_TYPES.NEW_API,
    extract: extractNewApiAuthBundle,
  }
