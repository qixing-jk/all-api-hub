import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type { CookieRequestSession } from "~/services/apiTransport/headerOverrides"
import type { ApiTransportRequest } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { getSafariNativeMessagingApi } from "~/utils/browser/safariNativeMessaging"
import { t } from "~/utils/i18n/core"

/** Safari uses the app extension's isolated native transport for saved Cookies. */
export function isSafariNativeCookieEnabled() {
  return import.meta.env.BROWSER === "safari"
}

const permissionError = () =>
  new ApiError(
    t("messages:cookieTransport.permissionRequired"),
    undefined,
    undefined,
    API_ERROR_CODES.COOKIE_PERMISSION_REQUIRED,
  )

const unavailableError = () =>
  new ApiError(
    t("messages:cookieTransport.requestUnavailable"),
    undefined,
    undefined,
    API_ERROR_CODES.COOKIE_REQUEST_UNAVAILABLE,
  )

const scopeError = () =>
  new ApiError(
    t("messages:cookieTransport.scopeUnavailable"),
    undefined,
    undefined,
    API_ERROR_CODES.COOKIE_REQUEST_UNAVAILABLE,
  )

/** Cover direct refresh DTOs as well as requests from stored-account factories. */
export function withSafariNativeCookieSession(
  request: ApiTransportRequest,
): ApiTransportRequest {
  if (
    request.cookieSession ||
    !isSafariNativeCookieEnabled() ||
    request.auth?.authType !== AuthTypeEnum.Cookie ||
    !request.auth.cookie?.trim()
  )
    return request
  return {
    ...request,
    cookieSession: {
      origin: new URL(request.baseUrl).origin,
      cookieHeader: request.auth.cookie,
    },
  }
}

/** Bound native messages even when Safari drops a bridge reply on suspension. */
async function withNativeReplyDeadline<T>(
  reply: Promise<T>,
  ms: number,
  expired?: () => void,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      reply,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          expired?.()
          reject(new Error("Safari native Cookie bridge unavailable"))
        }, ms)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

interface NativeReply {
  version: number
  id: string
  ok: boolean
  code?: string
  status?: number
  headers?: Record<string, string>
  body?: string
}

/** Buffered, isolated transport. Never falls back to browser cookies or DNR. */
export async function fetchSafariNativeCookie(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  headers: Headers,
  session: CookieRequestSession,
  onDispatch?: () => void,
): Promise<Response> {
  const api = getSafariNativeMessagingApi()
  const url = new URL(input instanceof Request ? input.url : String(input))
  // Plain HTTP is restricted to loopback fixtures. HTTPS uses system TLS trust.
  if (
    url.origin !== session.origin ||
    !(
      url.protocol === "https:" ||
      (url.protocol === "http:" && url.hostname === "127.0.0.1")
    ) ||
    url.username ||
    url.password ||
    !session.cookieHeader.trim() ||
    /[\r\n]/.test(session.cookieHeader)
  ) {
    throw scopeError()
  }
  const hostPattern = `${url.protocol}//${url.hostname}/*`
  const signal =
    init?.signal ?? (input instanceof Request ? input.signal : undefined)
  const hasUrlGrant = async () => {
    try {
      return await withNativeReplyDeadline(
        (async () => {
          if (
            !(await api.permissions.contains({
              permissions: ["nativeMessaging", "cookies"],
              origins: [hostPattern],
            })) ||
            typeof api.cookies?.remove !== "function"
          )
            return false
          // Safari contains() checks granted patterns, not specific URL Deny.
          // remove() checks that URL; a random reserved, nonexistent name neither
          // reads a login cookie nor creates one, and issues no HTTP request.
          await api.cookies.remove({
            url: url.href,
            name: "__all_api_hub_native_access_" + crypto.randomUUID(),
          })
          return true
        })(),
        2000,
      )
    } catch {
      return false
    }
  }
  signal?.throwIfAborted()
  if (!(await hasUrlGrant())) {
    throw permissionError()
  }
  signal?.throwIfAborted()
  const body = init?.body
  if (input instanceof Request || (body != null && typeof body !== "string")) {
    throw scopeError()
  }
  if (body && new TextEncoder().encode(body).length > 512 * 1024)
    throw scopeError()
  const id = crypto.randomUUID()
  const app = "io.github.qixingjk.allapihub"
  // Negotiate before sending any URL, header or body. An older converter
  // handler can log full messages; it must never receive account credentials.
  let capability: {
    version?: number
    id?: string
    ok?: boolean
    transport?: string
    cancel?: boolean
    urlPolicy?: string
    deadline?: boolean
  }
  try {
    capability = await withNativeReplyDeadline(
      api.runtime.sendNativeMessage(app, {
        version: 3,
        command: "capabilities",
        id,
      }),
      10000,
    )
  } catch {
    throw unavailableError()
  }
  signal?.throwIfAborted()
  if (
    capability?.version !== 3 ||
    capability.id !== id ||
    !capability.ok ||
    capability.transport !== "isolated-cookie-urlsession" ||
    capability.cancel !== true ||
    capability.deadline !== true ||
    capability.urlPolicy !== "https-or-loopback-http"
  ) {
    throw unavailableError()
  }
  let cancelled = false
  const cancel = () => {
    cancelled = true
    // Keep awaiting the original reply so transport leases include native cleanup.
    // Native errors and message contents must never be logged.
    void api.runtime
      .sendNativeMessage(app, { version: 3, command: "cancel", id })
      .catch(() => {})
  }
  let finished = false
  let checking = false
  const removed = () => {
    if (finished || checking || cancelled) return
    checking = true
    void hasUrlGrant()
      .then((granted) => {
        if (!finished && !granted) cancel()
      })
      .finally(() => {
        checking = false
      })
  }
  signal?.addEventListener("abort", cancel, { once: true })
  api.permissions.onRemoved.addListener(removed)
  // Safari may add a URL deny without emitting onRemoved for a broad grant.
  // This is bounded detection/cancellation, not atomic Safari/URLSession policy.
  const permissionTimer = setInterval(removed, 250)
  try {
    // Register removal first, then recheck: a grant can disappear while the
    // capability handshake is pending. Never upload Cookie under that old grant.
    if (!(await hasUrlGrant()) || cancelled) {
      throw permissionError()
    }
    signal?.throwIfAborted()
    // Internal markers are browser interception controls, not upstream headers.
    for (const name of [...headers.keys()])
      if (name.startsWith("all-api-hub")) headers.delete(name)
    headers.set("cookie", session.cookieHeader)
    headers.set("origin", session.origin)
    onDispatch?.()
    let result: NativeReply
    try {
      result = await withNativeReplyDeadline(
        api.runtime.sendNativeMessage(app, {
          version: 3,
          command: "request",
          id,
          deadline: Date.now() + 20000,
          url: url.href,
          origin: session.origin,
          method: init?.method ?? "GET",
          headers: Object.fromEntries(headers.entries()),
          body: body ?? null,
        }),
        20000,
        cancel,
      )
    } catch {
      signal?.throwIfAborted()
      throw unavailableError()
    }
    signal?.throwIfAborted()
    if (cancelled) throw permissionError()
    if (
      result?.version !== 3 ||
      result.id !== id ||
      !result.ok ||
      !Number.isInteger(result.status) ||
      result.status! < 200 ||
      result.status! > 599 ||
      typeof result.body !== "string" ||
      new TextEncoder().encode(result.body).length > 512 * 1024
    ) {
      // Do not reflect native/upstream errors: they can contain credentials.
      throw unavailableError()
    }
    const responseHeaders = new Headers(result.headers)
    responseHeaders.delete("set-cookie")
    responseHeaders.delete("set-cookie2")
    return new Response(
      [204, 205, 304].includes(result.status!) ? null : result.body,
      { status: result.status, headers: responseHeaders },
    )
  } finally {
    finished = true
    clearInterval(permissionTimer)
    signal?.removeEventListener("abort", cancel)
    api.permissions.onRemoved.removeListener(removed)
  }
}
