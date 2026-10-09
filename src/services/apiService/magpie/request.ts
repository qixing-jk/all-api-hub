import {
  composeAbortSignals,
  createDeferredAbortDeadline,
} from "~/services/apiTransport/abortableTask"
import { normalizeMagpieBaseUrl, type MagpieConfig } from "~/types/magpieConfig"

export interface MagpieRequestOptions {
  signal?: AbortSignal
}

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
 * Bearer or inference keys. Re-establish the configured session before every
 * operation so browser logout or server restart does not silently change it.
 * https://github.com/yetone/magpie/blob/ea6f8f89f83143e39b139582e75a1dda1fcff4cf/internal/gui/web.go
 */
export async function requestMagpie(
  config: MagpieConfig,
  path: string,
  body?: unknown,
  options?: MagpieRequestOptions,
): Promise<unknown> {
  const baseUrl = normalizeMagpieBaseUrl(config.baseUrl)
  if (!config.webKey.trim())
    throw new MagpieApiError("Missing Magpie web key", 401, false, true)
  const deadline = createDeferredAbortDeadline(30_000)
  const signal = composeAbortSignals([options?.signal, deadline.signal])
  let dispatched = false
  let status: number | undefined
  const execute = async () => {
    signal.signal?.throwIfAborted()
    deadline.start()
    const login = await fetch(
      `${baseUrl}/?${new URLSearchParams({ k: config.webKey.trim() })}`,
      {
        method: "GET",
        credentials: "include",
        redirect: "follow",
        signal: signal.signal,
      },
    )
    if (!login.ok)
      throw new MagpieApiError(
        "Magpie web authentication failed",
        login.status,
        false,
        true,
      )
    void login.body?.cancel().catch(() => undefined)
    signal.signal?.throwIfAborted()
    dispatched = true
    const response = await fetch(`${baseUrl}${path}`, {
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
    status = response.status
    // A save may fail after storing the provider (model preferences, etc.).
    // Only authentication/routing rejections prove that a write did not apply.
    if (!response.ok)
      throw new MagpieApiError(
        "Magpie management request failed",
        status,
        true,
        [401, 403, 404, 405].includes(status),
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
