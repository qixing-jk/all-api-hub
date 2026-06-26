import { accountStorage } from "~/services/accounts/accountStorage"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("LegacyAccountAwareRequest")

/**
 * Temporary migration helper for legacy callers that still build requests
 * without stable account identity. New account API flows should use
 * createDisplayAccountRequestContext or resolveStoredAccountApiContext instead.
 */
export async function resolveLegacyAccountAwareRequest(
  request: ApiServiceRequest,
  context: { endpoint?: string } = {},
): Promise<ApiServiceRequest> {
  if (request.accountId) return request

  const userId = request.auth?.userId

  logger.warn("fetchApi called without accountId in request", {
    baseUrl: request.baseUrl,
    userId,
    endpoint: context.endpoint,
    authType: request.auth?.authType ?? AuthTypeEnum.None,
    hasAccessToken: Boolean(request.auth?.accessToken),
    hasCookie: Boolean(request.auth?.cookie),
  })

  const accountInfo = await accountStorage.getAccountByBaseUrlAndUserId(
    request.baseUrl,
    userId,
  )

  if (!accountInfo) return request

  return {
    ...request,
    accountId: accountInfo.id,
    cookieAuthSessionCookie:
      request.cookieAuthSessionCookie ?? accountInfo.cookieAuth?.sessionCookie,
  }
}
