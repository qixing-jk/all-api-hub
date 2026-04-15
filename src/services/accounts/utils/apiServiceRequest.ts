import { getApiService } from "~/services/apiService"
import type { ApiServiceRequest } from "~/services/apiService/common/type"
import { AuthTypeEnum, type ApiToken, type DisplaySiteData } from "~/types"
import { createLogger } from "~/utils/core/logger"

const hasNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0

const logger = createLogger("DisplayAccountApiContext")
const DISPLAY_ACCOUNT_API_TIMEOUT_MS = 20_000
const DISPLAY_ACCOUNT_API_TIMEOUT_MESSAGE = "request timeout"

export class InvalidTokenPayloadError extends Error {
  readonly code = "INVALID_TOKEN_PAYLOAD"
  readonly accountId: string
  readonly baseUrl: string
  readonly siteType: string
  readonly responseType: string

  constructor(params: {
    accountId: string
    baseUrl: string
    siteType: string
    responseType: string
  }) {
    super("invalid_token_payload")
    this.name = "InvalidTokenPayloadError"
    this.accountId = params.accountId
    this.baseUrl = params.baseUrl
    this.siteType = params.siteType
    this.responseType = params.responseType
  }
}

const withDisplayAccountApiTimeout = async <T>(
  params: {
    account: Pick<DisplaySiteData, "id" | "baseUrl" | "siteType">
    operation: "fetchAccountTokens" | "resolveApiTokenKey"
    promise: Promise<T>
  },
): Promise<T> => {
  const { account, operation, promise } = params

  let timeoutId: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          logger.warn("Display-account API request timed out", {
            accountId: account.id,
            baseUrl: account.baseUrl,
            siteType: account.siteType,
            operation,
            timeoutMs: DISPLAY_ACCOUNT_API_TIMEOUT_MS,
          })

          reject(new Error(DISPLAY_ACCOUNT_API_TIMEOUT_MESSAGE))
        }, DISPLAY_ACCOUNT_API_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  }
}

/**
 * Build the shared ApiService request DTO used by account-scoped UI flows.
 */
const buildApiRequestFromDisplayAccount = (
  account: Pick<
    DisplaySiteData,
    | "baseUrl"
    | "id"
    | "authType"
    | "userId"
    | "token"
    | "cookieAuthSessionCookie"
  >,
): ApiServiceRequest => ({
  baseUrl: account.baseUrl,
  accountId: account.id,
  auth: {
    authType: account.authType,
    userId: account.userId,
    accessToken: account.token,
    cookie: account.cookieAuthSessionCookie,
  },
})

/**
 * Resolve both the site-specific service and its request DTO for a display account.
 */
export const createDisplayAccountApiContext = (
  account: Pick<
    DisplaySiteData,
    | "siteType"
    | "baseUrl"
    | "id"
    | "authType"
    | "userId"
    | "token"
    | "cookieAuthSessionCookie"
  >,
) => ({
  service: getApiService(account.siteType),
  request: buildApiRequestFromDisplayAccount(account),
})

/**
 * Fetches the current token inventory for a display account.
 */
export async function fetchDisplayAccountTokens(
  account: Pick<
    DisplaySiteData,
    | "siteType"
    | "baseUrl"
    | "id"
    | "authType"
    | "userId"
    | "token"
    | "cookieAuthSessionCookie"
  >,
): Promise<ApiToken[]> {
  const { service, request } = createDisplayAccountApiContext(account)
  const tokensResponse = await withDisplayAccountApiTimeout({
    account,
    operation: "fetchAccountTokens",
    promise: service.fetchAccountTokens(request),
  })

  if (Array.isArray(tokensResponse)) {
    return tokensResponse
  }

  logger.warn("Token response is not an array", {
    accountId: account.id,
    baseUrl: account.baseUrl,
    responseType: typeof tokensResponse,
    siteType: account.siteType,
  })

  throw new InvalidTokenPayloadError({
    accountId: account.id,
    baseUrl: account.baseUrl,
    siteType: account.siteType,
    responseType: typeof tokensResponse,
  })
}

/**
 * Resolves a token into a transient clone with a usable secret key for the
 * current display-account context, without mutating the shared inventory item.
 */
export async function resolveDisplayAccountTokenForSecret<
  TToken extends ApiToken,
>(
  account: Pick<
    DisplaySiteData,
    | "siteType"
    | "baseUrl"
    | "id"
    | "authType"
    | "userId"
    | "token"
    | "cookieAuthSessionCookie"
  >,
  token: TToken,
): Promise<TToken> {
  const { service, request } = createDisplayAccountApiContext(account)
  const resolvedKey = await withDisplayAccountApiTimeout({
    account,
    operation: "resolveApiTokenKey",
    promise: service.resolveApiTokenKey(request, token),
  })

  if (resolvedKey === token.key) {
    return token
  }

  return {
    ...token,
    key: resolvedKey,
  }
}

/**
 * Guard used by token-management entry points before create/list actions.
 */
export const canManageDisplayAccountTokens = (
  account: DisplaySiteData | null | undefined,
): account is DisplaySiteData => {
  if (!account || account.disabled === true) {
    return false
  }

  if (account.authType === AuthTypeEnum.None) {
    return false
  }

  const hasToken = hasNonEmptyString(account.token)
  const hasCookie = hasNonEmptyString(account.cookieAuthSessionCookie)

  if (
    !hasNonEmptyString(account.id) ||
    !hasNonEmptyString(account.baseUrl) ||
    !hasNonEmptyString(account.siteType) ||
    !Number.isFinite(account.userId)
  ) {
    return false
  }

  if (account.authType === AuthTypeEnum.AccessToken) {
    return hasToken
  }

  if (account.authType === AuthTypeEnum.Cookie) {
    return hasToken || hasCookie
  }

  return false
}
