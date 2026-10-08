import {
  invalidateDetailSchemaCapabilityCache,
  resetChannelDetailSchemaCacheForTesting,
} from "~/services/apiService/axonHub/channelProjection"
import {
  cacheKeyForConfig,
  normalizeBaseUrl,
} from "~/services/apiService/axonHub/configIdentity"
import {
  AxonHubRequestError,
  throwIfAborted,
  toAxonHubRequestError,
} from "~/services/apiService/axonHub/graphqlProtocol"
import type { AxonHubConfig } from "~/types/axonHubConfig"

const tokenCache = new Map<string, string>()

const inflightSignIns = new Map<string, Promise<string>>()

export const __resetCachesForTesting = () => {
  tokenCache.clear()
  inflightSignIns.clear()
  resetChannelDetailSchemaCacheForTesting()
}

/**
 * Sign in to AxonHub admin and cache the returned session token.
 */
export async function signIn(
  config: AxonHubConfig,
  options?: Pick<RequestInit, "signal">,
): Promise<string> {
  const baseUrl = normalizeBaseUrl(config.baseUrl)
  throwIfAborted(options?.signal)

  let response: Response
  try {
    response = await fetch(`${baseUrl}/admin/auth/signin`, {
      method: "POST",
      signal: options?.signal,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: config.email,
        password: config.password,
      }),
    })
  } catch (error) {
    throw toAxonHubRequestError(error, "not-dispatched", "unavailable")
  }

  if (!response.ok) {
    throw new AxonHubRequestError(
      response.status >= 500 ? "unavailable" : "authentication",
      "not-dispatched",
    )
  }

  let data: unknown
  try {
    data = await response.json()
  } catch (error) {
    throw toAxonHubRequestError(error, "not-dispatched", "protocol")
  }

  if (
    typeof data !== "object" ||
    data === null ||
    !("token" in data) ||
    typeof data.token !== "string" ||
    !data.token
  ) {
    throw new AxonHubRequestError("protocol", "not-dispatched")
  }

  tokenCache.set(cacheKeyForConfig(config), data.token)
  // A successful authentication is a bounded capability-renewal boundary: a
  // deployment may have upgraded since an optional detail shape was rejected.
  invalidateDetailSchemaCapabilityCache(config)
  return data.token
}

export const getSessionToken = async (
  config: AxonHubConfig,
  forceRefresh = false,
  options?: Pick<RequestInit, "signal">,
) => {
  const key = cacheKeyForConfig(config)
  const callerSignal = options?.signal ?? undefined
  const hasCallerCancellation = Boolean(callerSignal)
  if (!forceRefresh) {
    const cachedToken = tokenCache.get(key)
    if (cachedToken) return cachedToken

    const inflightSignIn = inflightSignIns.get(key)
    if (inflightSignIn) {
      if (callerSignal) {
        return awaitSignInWithCallerCancellation(inflightSignIn, callerSignal)
      }

      return inflightSignIn
    }
  }

  tokenCache.delete(key)
  if (!hasCallerCancellation || forceRefresh) {
    inflightSignIns.delete(key)
  }

  if (hasCallerCancellation) {
    return signIn(config, options)
  }

  const pendingSignIn = signIn(config, options).finally(() => {
    inflightSignIns.delete(key)
  })

  inflightSignIns.set(key, pendingSignIn)
  return pendingSignIn
}

const awaitSignInWithCallerCancellation = async (
  pendingSignIn: Promise<string>,
  callerSignal: AbortSignal,
) => {
  let abort: (() => void) | null = null
  try {
    return await Promise.race([
      pendingSignIn,
      new Promise<string>((_resolve, reject) => {
        abort = () => {
          reject(new AxonHubRequestError("aborted", "not-dispatched"))
        }

        if (callerSignal.aborted) {
          abort()
          return
        }

        callerSignal.addEventListener("abort", abort, { once: true })
      }),
    ])
  } finally {
    if (abort) {
      callerSignal.removeEventListener("abort", abort)
    }
  }
}
