import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { getChromiumRequestHeaderApi } from "~/utils/browser/requestHeaderApi"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { sanitizeSensitiveErrorText } from "~/utils/core/sanitizeSensitiveErrorText"
import { t } from "~/utils/i18n/core"

const logger = createLogger("RequestHeaderOverrides")

/** User-maintained headers can contain secrets; never log their values. */
type HeaderOverrides = Record<string, string>

/** Trusted transport credentials, separate from user-editable headers. */
export interface CookieRequestSession {
  origin: string
  cookieHeader: string
}

interface HeaderFetchExecution {
  cookieSession?: CookieRequestSession
  onDispatch?: () => void
}

const HEADER_FETCH_LOCK = "all-api-hub:request-header-overrides"
// Separate from the per-tab Cookie and download rules (1M and 2M).
const HEADER_OVERRIDE_RULE_ID = 3_000_000
const forbiddenHeaders = new Set([
  "accept-charset",
  "accept-encoding",
  "access-control-request-headers",
  "access-control-request-method",
  "connection",
  "content-length",
  "cookie",
  "cookie2",
  "date",
  "dnt",
  "expect",
  "host",
  "keep-alive",
  "origin",
  "referer",
  "set-cookie",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "via",
  "x-http-method",
  "x-http-method-override",
  "x-method-override",
  "all-api-hub",
  "all-api-hub-cookie-auth",
  "all-api-hub-session-cookie",
])

/** Validate at form, persistence and transport boundaries, without exposing values. */
export function normalizeHeaderOverrides(raw: unknown): HeaderOverrides {
  if (raw === undefined || raw === null) return {}
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(
      t("apiCredentialProfiles:dialog.errors.requestHeadersInvalid"),
    )
  }
  const result: HeaderOverrides = {}
  for (const [rawName, rawValue] of Object.entries(raw)) {
    const name = rawName.trim().toLowerCase()
    if (
      !/^[!#$%&'*+.^_`|~0-9a-z-]+$/.test(name) ||
      forbiddenHeaders.has(name) ||
      name.startsWith("sec-") ||
      name.startsWith("proxy-") ||
      typeof rawValue !== "string" ||
      /[^\t\x20-\x7e\x80-\xff]/.test(rawValue) ||
      Object.hasOwn(result, name)
    ) {
      throw new Error(
        t("apiCredentialProfiles:dialog.errors.requestHeadersInvalid"),
      )
    }
    Object.defineProperty(result, name, {
      value: rawValue.trim(),
      enumerable: true,
      configurable: true,
      writable: true,
    })
  }
  return Object.fromEntries(
    Object.entries(result).sort(([a], [b]) => a.localeCompare(b)),
  )
}

/** Strip reflected custom values before logging upstream model-discovery errors. */
export function sanitizeHeaderOverrideError(
  error: unknown,
  overrides?: HeaderOverrides,
): string {
  const secrets = Object.values(overrides ?? {})
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
  return sanitizeSensitiveErrorText(
    secrets.reduce(
      (message, secret) => message.split(secret).join("[REDACTED]"),
      getErrorMessage(error),
    ),
  )
}

/**
 * Chromium-controlled headers require DNR. Ordinary API/SDK fetches take a
 * shared Web Lock; UA and private Cookie fetches take it exclusively, so
 * other extension requests cannot inherit a concurrent account's headers.
 * The lock is released after response headers and rule cleanup, so SSE
 * bodies remain native streams. Web Locks also coordinate MV3/UI contexts.
 */
export async function fetchWithHeaderOverrides(
  input: RequestInfo | URL,
  init?: RequestInit,
  overrides?: HeaderOverrides,
  execution?: HeaderFetchExecution,
): Promise<Response> {
  const custom = normalizeHeaderOverrides(overrides)
  const hasOverrides = Object.keys(custom).length > 0
  const headers = new Headers(
    init?.headers ?? (input instanceof Request ? input.headers : undefined),
  )
  for (const [name, value] of Object.entries(custom)) headers.set(name, value)
  const session = execution?.cookieSession
  // Safari's DNR condition support differs from Chromium. API presence alone
  // cannot establish account isolation; enable this only after native validation.
  if (session && import.meta.env.BROWSER === "safari")
    throw new ApiError(
      t("messages:cookieTransport.browserUnsupported"),
      undefined,
      undefined,
      API_ERROR_CODES.COOKIE_REQUEST_UNAVAILABLE,
    )
  if (session) {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (
      url.origin !== session.origin ||
      !session.cookieHeader.trim() ||
      /[\r\n]/.test(session.cookieHeader)
    )
      throw new ApiError(
        t("messages:cookieTransport.scopeUnavailable"),
        undefined,
        undefined,
        API_ERROR_CODES.COOKIE_REQUEST_UNAVAILABLE,
      )
  }
  const options = session
    ? {
        ...init,
        headers,
        credentials: "omit" as const,
        redirect: "error" as const,
      }
    : hasOverrides
      ? { ...init, headers, redirect: "error" as const }
      : init
  const userAgent = custom["user-agent"]
  const chromeApi = getChromiumRequestHeaderApi()
  const dnr = chromeApi?.declarativeNetRequest
  const locks = globalThis.navigator?.locks
  const needsRule =
    Boolean(session) ||
    (userAgent !== undefined && import.meta.env.BROWSER !== "firefox")
  const canCoordinate = Boolean(locks && chromeApi?.runtime?.id)
  const hasDnrApi = typeof dnr?.updateSessionRules === "function"
  let hasDnrPermission = false
  let permissionInspectionFailed = false
  try {
    hasDnrPermission =
      hasDnrApi &&
      Boolean(
        await chromeApi?.permissions?.contains({
          permissions: ["declarativeNetRequestWithHostAccess"],
        }),
      )
  } catch {
    // An inspection failure does not prove that an old credential rule is
    // inactive. Ordinary requests must still establish cleanup before dispatch.
    permissionInspectionFailed = hasDnrApi
  }
  const canUseRules = canCoordinate && hasDnrPermission

  if (needsRule && !canUseRules) {
    if (session)
      throw new ApiError(
        t("messages:cookieTransport.permissionRequired"),
        undefined,
        undefined,
        API_ERROR_CODES.COOKIE_PERMISSION_REQUIRED,
      )
    throw new Error(
      t("apiCredentialProfiles:dialog.errors.userAgentPermission"),
    )
  }
  const dispatch = () => {
    execution?.onDispatch?.()
    return fetch(input, options)
  }
  if (!canCoordinate) return dispatch()

  const signal =
    init?.signal ?? (input instanceof Request ? input.signal : undefined)
  return locks!.request(
    HEADER_FETCH_LOCK,
    { mode: needsRule ? "exclusive" : "shared", ...(signal ? { signal } : {}) },
    async () => {
      signal?.throwIfAborted()
      if (!needsRule) {
        // A terminated owner may leave an install pending in the browser's
        // native update queue. A rule query can still report [] at that point;
        // enqueue removal unconditionally so it completes after earlier updates.
        // No live exclusive owner can be installing a rule under this shared lock.
        if (hasDnrPermission || permissionInspectionFailed) {
          await dnr!.updateSessionRules({
            removeRuleIds: [HEADER_OVERRIDE_RULE_ID],
          })
        }
        signal?.throwIfAborted()
        return dispatch()
      }

      const url = new URL(input instanceof Request ? input.url : String(input))
      url.hash = ""
      const regexFilter = `^${url.href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`
      try {
        await dnr!.updateSessionRules({
          removeRuleIds: [HEADER_OVERRIDE_RULE_ID],
          addRules: [
            {
              id: HEADER_OVERRIDE_RULE_ID,
              priority: 1,
              action: {
                type: "modifyHeaders",
                requestHeaders: [
                  ...(userAgent !== undefined
                    ? [
                        {
                          header: "user-agent",
                          operation: "set" as const,
                          value: userAgent,
                        },
                      ]
                    : []),
                  ...(session
                    ? [
                        {
                          header: "cookie",
                          operation: "set" as const,
                          value: session.cookieHeader,
                        },
                        {
                          header: "origin",
                          operation: "set" as const,
                          value: session.origin,
                        },
                      ]
                    : []),
                ],
              },
              condition: {
                regexFilter,
                isUrlFilterCaseSensitive: true,
                initiatorDomains: [chromeApi!.runtime.id!],
                ...(session
                  ? {
                      requestMethods: [
                        (
                          init?.method ??
                          (input instanceof Request ? input.method : "GET")
                        ).toLowerCase() as NonNullable<
                          browser.declarativeNetRequest.Rule["condition"]["requestMethods"]
                        >[number],
                      ],
                    }
                  : {}),
                resourceTypes: ["xmlhttprequest", "other"],
              },
            },
          ],
        })
      } catch {
        if (session)
          throw new ApiError(
            t("messages:cookieTransport.requestUnavailable"),
            undefined,
            undefined,
            API_ERROR_CODES.COOKIE_REQUEST_UNAVAILABLE,
          )
        throw new Error(
          t("apiCredentialProfiles:dialog.errors.userAgentPermission"),
        )
      }
      try {
        signal?.throwIfAborted()
        return await dispatch()
      } finally {
        // Native DNR calls are not cancellable. Keep the lease until cleanup
        // settles even if the caller already timed out; a late add must not
        // overlap the next account. A new owner repairs orphaned rules above.
        try {
          await dnr!.updateSessionRules({
            removeRuleIds: [HEADER_OVERRIDE_RULE_ID],
          })
        } catch (error) {
          logger.warn(
            "Failed to remove request header rule; next request must recover it",
            session
              ? "Private Cookie rule cleanup failed"
              : sanitizeHeaderOverrideError(error, custom),
          )
        }
      }
    },
  )
}

/** Bind credential headers once for an SDK, including auth-fallback retries. */
export function createHeaderOverrideFetch(overrides?: HeaderOverrides) {
  return (input: RequestInfo | URL, init?: RequestInit) =>
    fetchWithHeaderOverrides(input, init, overrides)
}
