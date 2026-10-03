import { SITE_TYPES } from "~/constants/siteType"
import { resolveStoredAccountUserIdentity } from "~/services/accounts/accountIdentity"
import {
  NEW_API_DASHBOARD_AUTH_INVALID_RESPONSE,
  NEW_API_DASHBOARD_AUTH_REFRESH_PATH,
  parseNewApiDashboardAuthBundleResponse,
} from "~/services/apiService/newApi/dashboardAuth"
import { getErrorMessage } from "~/utils/core/error"
import { isRecord } from "~/utils/core/object"
import { trimToNull } from "~/utils/core/string"

import {
  NEW_API_DASHBOARD_TRANSIENT_AUTH_KIND,
  type ContentSessionExtractionContext,
  type ContentSessionExtractionResult,
  type ContentSessionExtractor,
} from "../contracts"

const CONTROLLED_ERROR_STATUSES = new Set([401, 409, 429])
const AUTH_REFRESH_REQUEST_ERROR = "New API session refresh request failed"

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

  const code = isRecord(body) ? trimToNull(body.code) : null
  const message = isRecord(body) ? trimToNull(body.message) : null
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
async function extractNewApiAuthBundle(
  context: ContentSessionExtractionContext,
): Promise<ContentSessionExtractionResult | null> {
  const origin = location.origin
  let response: Response
  const diagnostics = context.diagnostics
  diagnostics?.record("refresh_started")

  try {
    response = await fetch(`${origin}${NEW_API_DASHBOARD_AUTH_REFRESH_PATH}`, {
      credentials: "include",
      method: "POST",
    })
  } catch (error) {
    diagnostics?.record("refresh_failed", {
      reason: "network_error",
      error: getErrorMessage(error),
    })
    throw new Error(AUTH_REFRESH_REQUEST_ERROR)
  }
  diagnostics?.record("refresh_response", { status: response.status })

  if (response.status === 404 || response.status === 405) {
    diagnostics?.record("refresh_unsupported", { status: response.status })
    return null
  }
  if (!response.ok && CONTROLLED_ERROR_STATUSES.has(response.status)) {
    const error = await createControlledRefreshError(response)
    diagnostics?.record("refresh_failed", {
      reason: "http_error",
      status: response.status,
      error: error.message,
    })
    throw error
  }
  if (!response.ok) {
    diagnostics?.record("refresh_failed", {
      reason: "http_error",
      status: response.status,
    })
    throw createRefreshStatusError(response.status)
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    diagnostics?.record("refresh_invalid", { reason: "body_unreadable" })
    throw new Error(NEW_API_DASHBOARD_AUTH_INVALID_RESPONSE)
  }

  const parsed = parseNewApiDashboardAuthBundleResponse(body)
  diagnostics?.record("refresh_body_parsed", { kind: parsed.kind })
  if (parsed.kind === "malformed") {
    throw new Error(NEW_API_DASHBOARD_AUTH_INVALID_RESPONSE)
  }
  if (parsed.kind === "unrelated") return null

  const identity = resolveStoredAccountUserIdentity(
    parsed.bundle.user,
    SITE_TYPES.NEW_API,
  )
  if (!identity) {
    diagnostics?.record("refresh_invalid", { reason: "user_id_missing" })
    throw new Error(NEW_API_DASHBOARD_AUTH_INVALID_RESPONSE)
  }

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
    canExtract: (context) =>
      context.siteTypeHint === SITE_TYPES.NEW_API ||
      context.allowNewApiAuthProbe === true,
    extract: extractNewApiAuthBundle,
  }
