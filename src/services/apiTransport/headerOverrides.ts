import { getChromiumRequestHeaderApi } from "~/utils/browser/requestHeaderApi"
import { getErrorMessage } from "~/utils/core/error"
import { sanitizeSensitiveErrorText } from "~/utils/core/sanitizeSensitiveErrorText"
import { t } from "~/utils/i18n/core"

/** User-maintained headers can contain secrets; never log their values. */
type HeaderOverrides = Record<string, string>

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
 * Chromium drops fetch's User-Agent. A short-lived DNR rule supplies it instead.
 * All extension API/SDK fetches take a shared Web Lock; UA fetches take it
 * exclusively. Thus even ordinary requests to the same URL cannot inherit a
 * concurrent credential's UA. The lock is released on response headers so SSE
 * bodies remain native streams. Web Locks also coordinate MV3/UI contexts.
 */
export async function fetchWithHeaderOverrides(
  input: RequestInfo | URL,
  init?: RequestInit,
  overrides?: HeaderOverrides,
): Promise<Response> {
  const custom = normalizeHeaderOverrides(overrides)
  const hasOverrides = Object.keys(custom).length > 0
  const headers = new Headers(
    init?.headers ?? (input instanceof Request ? input.headers : undefined),
  )
  for (const [name, value] of Object.entries(custom)) headers.set(name, value)
  const options = hasOverrides
    ? { ...init, headers, redirect: "error" as const }
    : init
  const userAgent = custom["user-agent"]
  const chromeApi = getChromiumRequestHeaderApi()
  const dnr = chromeApi?.declarativeNetRequest
  const locks = globalThis.navigator?.locks
  const needsRule =
    userAgent !== undefined && import.meta.env.BROWSER !== "firefox"
  const canCoordinate = Boolean(locks && chromeApi?.runtime?.id)
  let hasDnrPermission = false
  try {
    hasDnrPermission =
      typeof dnr?.updateSessionRules === "function" &&
      Boolean(
        await chromeApi?.permissions?.contains({
          permissions: ["declarativeNetRequestWithHostAccess"],
        }),
      )
  } catch {
    // Permission inspection is unavailable in some extension contexts.
    // Ordinary headers still work; UA requests fail explicitly below.
  }
  const canUseRules = canCoordinate && hasDnrPermission

  if (needsRule && !canUseRules) {
    throw new Error(
      t("apiCredentialProfiles:dialog.errors.userAgentPermission"),
    )
  }
  if (!canCoordinate) return fetch(input, options)

  const signal =
    init?.signal ?? (input instanceof Request ? input.signal : undefined)
  return locks!.request(
    HEADER_FETCH_LOCK,
    { mode: needsRule ? "exclusive" : "shared", ...(signal ? { signal } : {}) },
    async () => {
      signal?.throwIfAborted()
      if (!needsRule) {
        // A terminated MV3 worker cannot execute finally. Clear its orphaned
        // rule before the next ordinary request, while no UA lease is active.
        if (hasDnrPermission)
          await dnr!.updateSessionRules({
            removeRuleIds: [HEADER_OVERRIDE_RULE_ID],
          })
        return fetch(input, options)
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
                  { header: "user-agent", operation: "set", value: userAgent! },
                ],
              },
              condition: {
                regexFilter,
                isUrlFilterCaseSensitive: true,
                initiatorDomains: [chromeApi!.runtime.id!],
                resourceTypes: ["xmlhttprequest", "other"],
              },
            },
          ],
        })
      } catch {
        throw new Error(
          t("apiCredentialProfiles:dialog.errors.userAgentPermission"),
        )
      }
      try {
        signal?.throwIfAborted()
        return await fetch(input, options)
      } finally {
        await dnr!.updateSessionRules({
          removeRuleIds: [HEADER_OVERRIDE_RULE_ID],
        })
      }
    },
  )
}

/** Bind credential headers once for an SDK, including auth-fallback retries. */
export function createHeaderOverrideFetch(overrides?: HeaderOverrides) {
  return (input: RequestInfo | URL, init?: RequestInit) =>
    fetchWithHeaderOverrides(input, init, overrides)
}
