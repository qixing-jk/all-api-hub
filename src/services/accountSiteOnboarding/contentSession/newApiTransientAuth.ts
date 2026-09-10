import { SITE_TYPES } from "~/constants/siteType"
import {
  NEW_API_DASHBOARD_TRANSIENT_AUTH_KIND,
  type ContentSessionTransientAuth,
  type ContentSessionTransientAuthContext,
} from "~/services/accountSiteOnboarding/contracts"

const REQUIRED_TRANSIENT_AUTH_FIELDS = [
  "kind",
  "token",
  "expiresAt",
  "sessionId",
  "origin",
] as const

/**
 * Validates completion-only dashboard auth against the requested New API site.
 */
export function normalizeNewApiDashboardTransientAuth(
  value: unknown,
  options: ContentSessionTransientAuthContext,
): ContentSessionTransientAuth | undefined {
  const acceptsSite =
    options.siteType === SITE_TYPES.NEW_API ||
    (options.siteType === SITE_TYPES.UNKNOWN &&
      options.allowNewApiAuthProbe === true &&
      options.siteTypeHint === SITE_TYPES.NEW_API)
  if (
    !acceptsSite ||
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !REQUIRED_TRANSIENT_AUTH_FIELDS.every((field) =>
      Object.prototype.hasOwnProperty.call(value, field),
    )
  ) {
    return undefined
  }

  const candidate = value as Record<
    (typeof REQUIRED_TRANSIENT_AUTH_FIELDS)[number],
    unknown
  >

  try {
    if (
      candidate.kind !== NEW_API_DASHBOARD_TRANSIENT_AUTH_KIND ||
      typeof candidate.token !== "string" ||
      typeof candidate.sessionId !== "string" ||
      typeof candidate.origin !== "string" ||
      typeof candidate.expiresAt !== "number" ||
      !Number.isFinite(candidate.expiresAt)
    ) {
      return undefined
    }

    const token = candidate.token.trim()
    const sessionId = candidate.sessionId.trim()
    const originValue = candidate.origin.trim()
    if (!token || !sessionId || !originValue) return undefined

    const origin = new URL(originValue).origin
    const expectedOrigin = new URL(options.baseUrl).origin
    if (origin !== expectedOrigin) return undefined

    return {
      kind: NEW_API_DASHBOARD_TRANSIENT_AUTH_KIND,
      token,
      expiresAt: candidate.expiresAt,
      sessionId,
      origin,
    }
  } catch {
    return undefined
  }
}
