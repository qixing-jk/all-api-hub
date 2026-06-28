import { normalizeAccountIdentity } from "~/services/accounts/accountIdentity"
import type {
  AccessTokenInfo,
  SiteStatusInfo,
  UserInfo,
} from "~/services/apiAdapters/contracts/accountBootstrap"
import { ApiError } from "~/services/apiService/common/errors"
import { fetchApiData } from "~/services/apiService/common/utils"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

const logger = createLogger("NewApiFamilyAccountBootstrap")

interface AccountBootstrapImplementation {
  fetchUserInfo: typeof fetchUserInfo
  getOrCreateAccessToken: typeof getOrCreateAccessToken
  fetchSiteStatus: typeof fetchSiteStatus
  fetchSupportCheckIn: (
    request: ApiServiceRequest,
  ) => Promise<boolean | undefined>
  extractDefaultExchangeRate: (
    siteStatus: SiteStatusInfo | null,
  ) => number | null
}

/**
 * Fetch default New API-family site status (includes pricing/exchange data).
 * Always treated as a public endpoint.
 */
export async function fetchSiteStatus(
  request: ApiServiceRequest,
): Promise<SiteStatusInfo | null> {
  const publicRequest: ApiServiceRequest = {
    ...request,
    auth: { authType: AuthTypeEnum.None },
  }

  try {
    return await fetchApiData<SiteStatusInfo>(publicRequest, {
      endpoint: "/api/status",
    })
  } catch (error) {
    logger.warn("获取站点状态信息失败", error)
    return null
  }
}

/**
 * Extract default exchange rate (USD) from status info with fallback order.
 */
export const extractDefaultExchangeRate = (
  statusInfo: SiteStatusInfo | null,
): number | null => {
  if (!statusInfo) {
    return null
  }

  if (statusInfo.price && statusInfo.price > 0) {
    return statusInfo.price
  }

  if (statusInfo.stripe_unit_price && statusInfo.stripe_unit_price > 0) {
    return statusInfo.stripe_unit_price
  }

  if (statusInfo.PaymentUSDRate && statusInfo.PaymentUSDRate > 0) {
    return statusInfo.PaymentUSDRate
  }

  return null
}

/**
 * Fetch default New API-family user info for account detection.
 */
export async function fetchUserInfo(request: ApiServiceRequest): Promise<{
  id: string
  username: string
  access_token: string
  user: UserInfo
}> {
  const userData = await fetchApiData<UserInfo>(request, {
    endpoint: "/api/user/self",
  })
  const userId = normalizeAccountIdentity(userData.id)

  if (!userId) {
    throw new ApiError(
      t("messages:errors.api.invalidResponseFormat"),
      undefined,
      "/api/user/self",
    )
  }

  return {
    id: userId,
    username: userData.username,
    access_token: userData.access_token || "",
    user: userData,
  }
}

/**
 * Create a default New API-family access token using cookie auth.
 */
export async function createAccessToken(
  request: ApiServiceRequest,
): Promise<string> {
  return await fetchApiData<string>(request, {
    endpoint: "/api/user/token",
  })
}

/**
 * Return an existing access token or create one for New API-family accounts.
 */
export async function getOrCreateAccessToken(
  request: ApiServiceRequest,
): Promise<AccessTokenInfo> {
  const userInfo = await fetchUserInfo(request)

  let accessToken = userInfo.access_token

  if (!accessToken) {
    logger.info("访问令牌为空，尝试自动创建")
    accessToken = await createAccessToken(request)
    logger.info("自动创建访问令牌成功")
  }

  return {
    username: userInfo.username,
    access_token: accessToken,
  }
}

/**
 * Check default New API-family check-in support from public site status.
 */
export async function fetchSupportCheckIn(
  request: ApiServiceRequest,
): Promise<boolean | undefined> {
  const siteStatus = await fetchSiteStatus(request)
  return siteStatus?.checkin_enabled
}

export const defaultAccountBootstrapImplementation: AccountBootstrapImplementation =
  {
    fetchUserInfo,
    getOrCreateAccessToken,
    fetchSiteStatus,
    fetchSupportCheckIn,
    extractDefaultExchangeRate,
  }
