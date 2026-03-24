import { getApiService } from "~/services/apiService"
import type { ApiServiceRequest } from "~/services/apiService/common/type"
import { AuthTypeEnum, type ApiToken, type DisplaySiteData } from "~/types"

const hasNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0

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
  const resolvedKey = await service.resolveApiTokenKey(request, token)

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
