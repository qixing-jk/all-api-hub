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
/** Capture credentials once and resolve URL-scoped cookies for each request in that operation. */
export function createCookieOperationSession({
  origin,
  loginCookieName,
}: {
  origin: string
  loginCookieName: string
}) {
  const snapshots = new WeakMap<ApiServiceRequest, Snapshot>()

  /** Saved credentials never borrow ambient cookies; callers own rotation policy. */
  async function withSession<TRequest extends ApiServiceRequest, T>(
    request: TRequest,
    run: (request: TRequest) => Promise<T>,
  ): Promise<T> {
    if (snapshots.has(request)) return run(request)
    // Caller cancellation covers the operation; only Cookie preparation has an overall limit.
    return runAbortableTask(
      async (signal) => {
        request = { ...request, abortSignal: signal }
        if (
          new URL(request.baseUrl).origin !== origin ||
          request.auth.authType !== AuthTypeEnum.Cookie
        ) {
          throw new ApiError(
            "Operation requires its console cookie session",
            undefined,
            undefined,
            API_ERROR_CODES.FEATURE_UNSUPPORTED,
          )
        }
        request.abortSignal?.throwIfAborted()
        const snapshot = await runAbortableTask(
          async (preparationSignal) => {
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
              if (!(await hasCookieReadPermissionForUrl(origin))) {
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
                    new URL(origin).hostname,
                    request.fetchContext?.cookieStoreId,
                  ),
                {
                  signals: [preparationSignal],
                  timeoutMs: request.requestTimeoutMs ?? 15_000,
                },
              )
              snapshot = { cookies: cookies.map((cookie) => ({ ...cookie })) }
            }
            preparationSignal?.throwIfAborted()
            return snapshot
          },
          { signals: [signal], timeoutMs: 60_000 },
        )
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
      },
    )
  }

  /** Bind one login credential while preserving every Cookie's URL scope. */
  function getSession(
    request: ApiServiceRequest,
    url: URL,
  ): CookieRequestSession {
    const snapshot = snapshots.get(request)
    if (!snapshot) throw new Error("Cookie operation session was not prepared")
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
          (!cookie.expirationDate ||
            cookie.expirationDate > Date.now() / 1000) &&
          (url.pathname === cookie.path ||
            (url.pathname.startsWith(cookie.path) &&
              (cookie.path.endsWith("/") ||
                url.pathname[cookie.path.length] === "/")))
        )
      })
      const logins = new Set(
        cookies
          .filter((cookie) => cookie.name === loginCookieName)
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
    return { origin, cookieHeader }
  }

  return { withSession, getSession }
}
