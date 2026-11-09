import { SITE_TYPES } from "~/constants/siteType"
import {
  composeAbortSignals,
  createDeferredAbortDeadline,
} from "~/services/apiTransport/abortableTask"
import { fetchWithHeaderOverrides } from "~/services/apiTransport/headerOverrides"
import {
  createOperationScopedValue,
  type ApiOperationContext,
} from "~/services/apiTransport/operationContext"
import { SharedRead } from "~/services/apiTransport/requestScheduling"
import {
  reportSiteRateLimitResponse,
  withSiteApiRequestTask,
} from "~/services/apiTransport/siteRequestLimiter"
import { normalizeMagpieBaseUrl, type MagpieConfig } from "~/types/magpieConfig"

const MAGPIE_REQUEST_TIMEOUT_MS = 30_000
const MAGPIE_REQUEST_STATUSES = {
  Unauthorized: 401,
  Forbidden: 403,
  NotFound: 404,
  MethodNotAllowed: 405,
} as const
const NON_APPLICATION_STATUSES: readonly number[] = Object.values(
  MAGPIE_REQUEST_STATUSES,
)

/** Authentication and replay discard bodies without blocking the next request. */
const discardResponseBody = (response: Response) => {
  void response.body?.cancel().catch(() => undefined)
}

export interface MagpieRequestOptions {
  signal?: AbortSignal
  operationContext?: ApiOperationContext
}

interface MagpieRequestSession {
  authenticated: boolean
  pendingLogin?: {
    read: SharedRead<void>
    dispatched: boolean
    listeners: Set<() => void>
  }
}
const requestSessions = new WeakMap<MagpieConfig, MagpieRequestSession>()
const sessionBinding = (config: MagpieConfig) =>
  JSON.stringify([normalizeMagpieBaseUrl(config.baseUrl), config.webKey.trim()])

/**
 * Chromium omits Fetch Metadata on non-trustworthy HTTP destinations. Magpie's
 * webOwnPage then compares every /api/ POST's Origin with its own host, including
 * read-only POSTs such as provider/key and provider/list. HTTPS and loopback
 * requests already carry Sec-Fetch-Site: none and need no header rule.
 * https://github.com/yetone/magpie/commit/361da10ee90ad48496af116f9d5261c5257ee1e1
 */
function needsRequestOrigin(baseUrl: string, path: string, body: unknown) {
  if (
    import.meta.env.BROWSER !== "chrome" ||
    body === undefined ||
    !path.startsWith("/api/")
  )
    return false
  const url = new URL(baseUrl)
  const hostname = url.hostname.replace(/\.$/, "")
  return (
    url.protocol === "http:" &&
    !(
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname === "[::1]" ||
      /^127(?:\.\d{1,3}){3}$/.test(hostname)
    )
  )
}

/** Shares authentication only within a caller-owned operation or native workspace. */
export const withMagpieRequestSession = createOperationScopedValue(
  (config: MagpieConfig) => {
    const sessionConfig = Object.freeze({ ...config })
    requestSessions.set(sessionConfig, { authenticated: false })
    return sessionConfig
  },
  sessionBinding,
)

/** Carries certainty about the resource request, not its preceding login read. */
export class MagpieApiError extends Error {
  constructor(
    message: string,
    readonly status: number | undefined,
    readonly dispatched: boolean,
    readonly confirmedNonApplication: boolean,
  ) {
    super(message)
    this.name = "MagpieApiError"
  }
}

/**
 * Magpie's Web UI authenticates only with a Cookie obtained from ?k=, not
 * Bearer or inference keys. Standalone calls authenticate independently;
 * caller-owned operations may reuse a successfully established session.
 * https://github.com/yetone/magpie/blob/ea6f8f89f83143e39b139582e75a1dda1fcff4cf/internal/gui/web.go
 */
export async function requestMagpie(
  config: MagpieConfig,
  path: string,
  body?: unknown,
  options?: MagpieRequestOptions,
): Promise<unknown> {
  if (options?.operationContext) {
    config = withMagpieRequestSession(config, options.operationContext.sessions)
  }
  const baseUrl = normalizeMagpieBaseUrl(config.baseUrl)
  if (!config.webKey.trim())
    throw new MagpieApiError(
      "Missing Magpie web key",
      MAGPIE_REQUEST_STATUSES.Unauthorized,
      false,
      true,
    )
  const deadline = createDeferredAbortDeadline(MAGPIE_REQUEST_TIMEOUT_MS)
  const signal = composeAbortSignals([options?.signal, deadline.signal])
  let dispatched = false
  let status: number | undefined
  const execute = async () => {
    signal.signal?.throwIfAborted()
    const session = requestSessions.get(config)
    const loginWithSignal = async (
      loginSignal?: AbortSignal,
      onDispatch = deadline.start,
    ) => {
      return await withSiteApiRequestTask(
        baseUrl,
        async () => {
          const login = await fetchWithHeaderOverrides(
            `${baseUrl}/?${new URLSearchParams({ k: config.webKey.trim() })}`,
            {
              method: "GET",
              credentials: "include",
              redirect: "follow",
              signal: loginSignal,
            },
            undefined,
            { onDispatch },
          )
          reportSiteRateLimitResponse(baseUrl, login)
          if (!login.ok)
            throw new MagpieApiError(
              "Magpie web authentication failed",
              login.status,
              false,
              true,
            )
          discardResponseBody(login)
        },
        loginSignal,
        undefined,
        SITE_TYPES.MAGPIE,
      )
    }
    const authenticate = async () => {
      if (!session) return loginWithSignal(signal.signal)
      if (!session.pendingLogin || session.pendingLogin.read.signal.aborted) {
        const pending = {
          dispatched: false,
          listeners: new Set<() => void>(),
          read: new SharedRead<void>(async (sharedOptions) => {
            try {
              await loginWithSignal(sharedOptions.signal, () => {
                pending.dispatched = true
                for (const listener of pending.listeners) listener()
              })
              sharedOptions.signal.throwIfAborted()
              session.authenticated = true
            } finally {
              if (session.pendingLogin === pending)
                session.pendingLogin = undefined
            }
          }),
        }
        session.pendingLogin = pending
      }
      const pending = session.pendingLogin
      if (pending.dispatched) deadline.start()
      pending.listeners.add(deadline.start)
      try {
        await pending.read.read({ signal: signal.signal })
      } finally {
        pending.listeners.delete(deadline.start)
      }
    }
    if (!session?.authenticated) await authenticate()
    signal.signal?.throwIfAborted()
    const send = () =>
      withSiteApiRequestTask(
        baseUrl,
        async () => {
          const response = await fetchWithHeaderOverrides(
            `${baseUrl}${path}`,
            {
              method: body === undefined ? "GET" : "POST",
              credentials: "include",
              redirect: "error",
              signal: signal.signal,
              ...(body === undefined
                ? {}
                : {
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                  }),
            },
            undefined,
            {
              matchRequestOrigin: needsRequestOrigin(baseUrl, path, body),
              onDispatch: () => {
                deadline.start()
                dispatched = true
              },
            },
          )
          status = response.status
          reportSiteRateLimitResponse(baseUrl, response)
          if (
            response.status === MAGPIE_REQUEST_STATUSES.Unauthorized &&
            session
          ) {
            session.authenticated = false
            if (body === undefined) {
              discardResponseBody(response)
              return { needsAuthentication: true as const }
            }
          }
          if (!response.ok)
            throw new MagpieApiError(
              "Magpie management request failed",
              status,
              true,
              NON_APPLICATION_STATUSES.includes(status),
            )
          try {
            return {
              needsAuthentication: false as const,
              data: (await response.json()) as unknown,
            }
          } catch {
            throw new MagpieApiError(
              "Invalid Magpie management response",
              status,
              true,
              false,
            )
          }
        },
        signal.signal,
        undefined,
        SITE_TYPES.MAGPIE,
      )
    let result = await send()
    if (result.needsAuthentication) {
      await authenticate()
      signal.signal?.throwIfAborted()
      result = await send()
    }
    if (result.needsAuthentication)
      throw new MagpieApiError(
        "Magpie management request failed",
        status,
        true,
        true,
      )
    return result.data
  }
  try {
    // Web Locks coordinate Options, Popup and background callers using the
    // same deployment. They never retain the management key in the lock name.
    const locks = globalThis.navigator?.locks
    return locks
      ? await locks.request(
          `all-api-hub:magpie:${baseUrl}`,
          { signal: signal.signal },
          execute,
        )
      : await execute()
  } catch (error) {
    if (error instanceof MagpieApiError) throw error
    if (!dispatched && options?.signal?.aborted) throw error
    throw new MagpieApiError(
      "Magpie management request did not complete",
      status,
      dispatched,
      !dispatched,
    )
  } finally {
    signal.dispose()
    deadline.dispose()
  }
}
