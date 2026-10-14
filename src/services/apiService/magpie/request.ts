import {
  composeAbortSignals,
  createDeferredAbortDeadline,
} from "~/services/apiTransport/abortableTask"
import {
  createOperationScopedValue,
  type ApiOperationContext,
} from "~/services/apiTransport/operationContext"
import { SharedRead } from "~/services/apiTransport/requestScheduling"
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
  pendingLogin?: SharedRead<void>
}
const requestSessions = new WeakMap<MagpieConfig, MagpieRequestSession>()
const sessionBinding = (config: MagpieConfig) =>
  JSON.stringify([normalizeMagpieBaseUrl(config.baseUrl), config.webKey.trim()])

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
    deadline.start()
    const session = requestSessions.get(config)
    const loginWithSignal = async (loginSignal?: AbortSignal) => {
      const login = await fetch(
        `${baseUrl}/?${new URLSearchParams({ k: config.webKey.trim() })}`,
        {
          method: "GET",
          credentials: "include",
          redirect: "follow",
          signal: loginSignal,
        },
      )
      if (!login.ok)
        throw new MagpieApiError(
          "Magpie web authentication failed",
          login.status,
          false,
          true,
        )
      discardResponseBody(login)
    }
    const authenticate = async () => {
      if (!session) return loginWithSignal(signal.signal)
      if (!session.pendingLogin || session.pendingLogin.signal.aborted) {
        const pending = new SharedRead<void>(async (sharedOptions) => {
          try {
            await loginWithSignal(sharedOptions.signal)
            sharedOptions.signal.throwIfAborted()
            session.authenticated = true
          } finally {
            if (session.pendingLogin === pending)
              session.pendingLogin = undefined
          }
        })
        session.pendingLogin = pending
      }
      await session.pendingLogin.read({ signal: signal.signal })
    }
    if (!session?.authenticated) await authenticate()
    signal.signal?.throwIfAborted()
    dispatched = true
    const send = () =>
      fetch(`${baseUrl}${path}`, {
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
      })
    let response = await send()
    if (response.status === MAGPIE_REQUEST_STATUSES.Unauthorized && session) {
      session.authenticated = false
      // Only GET reads may be replayed. Even rejected writes remain visible to callers.
      if (body === undefined) {
        discardResponseBody(response)
        await authenticate()
        signal.signal?.throwIfAborted()
        response = await send()
        if (response.status === MAGPIE_REQUEST_STATUSES.Unauthorized)
          session.authenticated = false
      }
    }
    status = response.status
    // A save may fail after storing the provider (model preferences, etc.).
    // Only authentication/routing rejections prove that a write did not apply.
    if (!response.ok)
      throw new MagpieApiError(
        "Magpie management request failed",
        status,
        true,
        NON_APPLICATION_STATUSES.includes(status),
      )
    try {
      return (await response.json()) as unknown
    } catch {
      throw new MagpieApiError(
        "Invalid Magpie management response",
        status,
        true,
        false,
      )
    }
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
