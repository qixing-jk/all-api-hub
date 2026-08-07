import { SITE_TYPES } from "~/constants/siteType"
import { resolveStoredAccountUserIdentity } from "~/services/accounts/accountIdentity"
import {
  NEW_API_DASHBOARD_AUTH_INVALID_RESPONSE,
  NEW_API_DASHBOARD_AUTH_REFRESH_PATH,
  parseNewApiDashboardAuthBundleResponse,
} from "~/services/apiService/newApi/dashboardAuth"

import {
  NEW_API_DASHBOARD_TRANSIENT_AUTH_KIND,
  type ContentSessionExtractionResult,
  type ContentSessionExtractor,
} from "../contracts"

const CONTROLLED_ERROR_STATUSES = new Set([401, 409, 429])
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
    response = await fetch(`${origin}${NEW_API_DASHBOARD_AUTH_REFRESH_PATH}`, {
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
    throw new Error(NEW_API_DASHBOARD_AUTH_INVALID_RESPONSE)
  }

  const parsed = parseNewApiDashboardAuthBundleResponse(body)
  if (parsed.kind === "malformed") {
    throw new Error(NEW_API_DASHBOARD_AUTH_INVALID_RESPONSE)
  }
  if (parsed.kind === "unrelated") return null

  const identity = resolveStoredAccountUserIdentity(
    parsed.bundle.user,
    SITE_TYPES.NEW_API,
  )
  if (!identity) throw new Error(NEW_API_DASHBOARD_AUTH_INVALID_RESPONSE)

  return {
    userId: identity.userId,
    user: identity.user,
    siteTypeHint: SITE_TYPES.NEW_API,
    transientAuth: {
      kind: NEW_API_DASHBOARD_TRANSIENT_AUTH_KIND,
      token: parsed.bundle.token,
      expiresAt: parsed.bundle.expiresAt,
      sessionId: parsed.bundle.sessionId,
      origin,
    },
  }
}

export const newApiAuthBundleContentSessionExtractor: ContentSessionExtractor =
  {
    id: "new-api-auth-bundle",
    canExtract: (context) => context.siteTypeHint === SITE_TYPES.NEW_API,
    extract: extractNewApiAuthBundle,
  }
