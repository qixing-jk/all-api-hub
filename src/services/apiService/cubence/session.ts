import { CUBENCE_WEB_ORIGIN } from "~/services/accountSiteDefinitions/identifiers"
import { runAbortableTask } from "~/services/apiTransport/abortableTask"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type { CookieRequestSession } from "~/services/apiTransport/headerOverrides"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { hasCookieReadPermissionForUrl } from "~/utils/browser/cookieHelper"
import { getCookiesForDomain } from "~/utils/browser/cookies"
import { normalizeCookieHeaderValue } from "~/utils/browser/cookieString"
import { t } from "~/utils/i18n/core"

type Snapshot =
  | { header: string }
  | { cookies: browser.cookies.Cookie[]; loginCookie?: string }
const snapshots = new WeakMap<ApiServiceRequest, Snapshot>()
// Cubence's console authenticates with this HttpOnly Cookie (CDP 2026-10-10).
const LOGIN_COOKIE_NAME = "token"

/**
 * Bind credentials for exactly one operation. Browser sessions are copied once;
 * saved credentials never borrow browser cookies or get silently replaced.
 * Cubence's verified CRUD does not require per-response Cookie rotation.
 */
export async function withCubenceSession<T>(
  request: ApiServiceRequest,
  run: (request: ApiServiceRequest) => Promise<T>,
): Promise<T> {
  // Firefox retains its existing page/interceptor transport until separately verified.
  if (import.meta.env.BROWSER === "firefox") return run(request)
  if (snapshots.has(request)) return run(request)
  // Includes Cookie preparation and lock admission, which happen before HTTP dispatch.
  return runAbortableTask(
    async (signal) => {
      request = { ...request, abortSignal: signal }
      if (
        new URL(request.baseUrl).origin !== CUBENCE_WEB_ORIGIN ||
        request.auth.authType !== AuthTypeEnum.Cookie
      ) {
        throw new ApiError(
          "Cubence requires its console cookie session",
          undefined,
          undefined,
          API_ERROR_CODES.FEATURE_UNSUPPORTED,
        )
      }
      request.abortSignal?.throwIfAborted()
      const header =
        normalizeCookieHeaderValue(request.auth.cookie ?? "") ||
        normalizeCookieHeaderValue(request.cookieAuthSessionCookie ?? "")
      let snapshot: Snapshot = { header }
      if (!header) {
        if (
          request.fetchContext?.incognito &&
          !request.fetchContext.cookieStoreId
        ) {
          throw new ApiError(
            t("messages:cookieTransport.scopeUnavailable"),
            undefined,
            undefined,
            API_ERROR_CODES.COOKIE_REQUEST_UNAVAILABLE,
          )
        }
        if (!(await hasCookieReadPermissionForUrl(CUBENCE_WEB_ORIGIN))) {
          throw new ApiError(
            t("messages:cookieTransport.permissionRequired"),
            undefined,
            undefined,
            API_ERROR_CODES.COOKIE_PERMISSION_REQUIRED,
          )
        }
        // Domain capture preserves API path scoping; it does not import other sites.
        const cookies = await runAbortableTask(
          () =>
            getCookiesForDomain(
              new URL(CUBENCE_WEB_ORIGIN).hostname,
              request.fetchContext?.cookieStoreId,
            ),
          { signals: [signal], timeoutMs: request.requestTimeoutMs ?? 15_000 },
        )
        snapshot = { cookies: cookies.map((cookie) => ({ ...cookie })) }
      }
      request.abortSignal?.throwIfAborted()
      const scoped = { ...request, auth: { ...request.auth } }
      snapshots.set(scoped, snapshot)
      try {
        return await run(scoped)
      } finally {
        snapshots.delete(scoped)
      }
    },
    {
      signals: [request.abortSignal, request.abortDeadline?.signal],
      timeoutMs: 60_000,
    },
  )
}

/** Bind one login credential while preserving every Cookie's URL scope. */
export function getCubenceCookieSession(
  request: ApiServiceRequest,
  url: URL,
): CookieRequestSession {
  const snapshot = snapshots.get(request)
  if (!snapshot) throw new Error("Cubence session was not prepared")
  let cookieHeader: string
  if ("header" in snapshot) {
    cookieHeader = snapshot.header
  } else {
    const cookies = snapshot.cookies.filter((cookie) => {
      const domain = cookie.domain.replace(/^\./, "")
      return (
        !cookie.partitionKey &&
        (cookie.hostOnly
          ? url.hostname === domain
          : url.hostname === domain || url.hostname.endsWith(`.${domain}`)) &&
        (!cookie.secure || url.protocol === "https:") &&
        (!cookie.expirationDate || cookie.expirationDate > Date.now() / 1000) &&
        (url.pathname === cookie.path ||
          (url.pathname.startsWith(cookie.path) &&
            (cookie.path.endsWith("/") ||
              url.pathname[cookie.path.length] === "/")))
      )
    })
    const logins = new Set(
      cookies
        .filter((cookie) => cookie.name === LOGIN_COOKIE_NAME)
        .map((cookie) => cookie.value),
    )
    const loginCookie = logins.values().next().value
    if (
      logins.size > 1 ||
      (snapshot.loginCookie !== undefined &&
        loginCookie !== snapshot.loginCookie)
    ) {
      throw new ApiError(
        t("messages:cookieTransport.scopeUnavailable"),
        undefined,
        url.pathname,
        API_ERROR_CODES.COOKIE_REQUEST_UNAVAILABLE,
      )
    }
    // WAF/analytics Cookies alone do not establish a console login.
    if (loginCookie) {
      snapshot.loginCookie = loginCookie
      cookieHeader = cookies
        .sort((a, b) => b.path.length - a.path.length)
        .map((cookie) => `${cookie.name}=${cookie.value}`)
        .join("; ")
    } else {
      cookieHeader = ""
    }
  }
  if (!cookieHeader)
    throw new ApiError(
      t("messages:cookieTransport.sessionUnavailable"),
      401,
      url.pathname,
      API_ERROR_CODES.HTTP_401,
    )
  return { origin: CUBENCE_WEB_ORIGIN, cookieHeader }
}
