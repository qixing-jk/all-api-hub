import { normalizeAccountIdentity } from "~/services/accounts/accountIdentity"
import type {
  AccessTokenInfo,
  UserInfo,
} from "~/services/apiAdapters/contracts/accountBootstrap"
import { newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

const logger = createLogger("NewApiFamilyAccountBootstrap")

interface SiteStatusInfo {
  price?: number
  stripe_unit_price?: number
  PaymentUSDRate?: number
  system_name?: string
  theme?: string
  /**
   * 是否启用签到功能
   */
  checkin_enabled?: boolean
  /**
   * Veloera public status uses a distinct snake-case field.
   */
  check_in_enabled?: boolean
}

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
  signal?: AbortSignal,
): Promise<SiteStatusInfo | null> {
  const publicRequest: ApiServiceRequest = {
    ...request,
    auth: { authType: AuthTypeEnum.None },
  }

  try {
    return await newApiFamilyRequests.data<SiteStatusInfo>(publicRequest, {
      endpoint: "/api/status",
      ...(signal ? { options: { signal } } : {}),
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

  for (const rate of [
    statusInfo.price,
    statusInfo.stripe_unit_price,
    statusInfo.PaymentUSDRate,
  ]) {
    // Preserve the existing upstream compatibility and precedence, including
    // numeric strings; bootstrap normalization must not tighten this contract.
    if (rate && rate > 0) {
      return rate
    }
  }

  return null
}

/**
 * Fetch default New API-family user info for account detection.
 */
export async function fetchUserInfo(
  request: ApiServiceRequest,
  expectedIdentity?: string,
): Promise<{
  id: string
  username: string
  access_token: string
  user: UserInfo
}> {
  const userData = await newApiFamilyRequests.data<UserInfo>(request, {
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

  const expectedUserId = normalizeAccountIdentity(
    expectedIdentity ?? request.auth.userId,
  )
  if (expectedUserId && userId !== expectedUserId) {
    throw new ApiError(
      "The authenticated account does not match the expected account",
      undefined,
      "/api/user/self",
      API_ERROR_CODES.ACCOUNT_IDENTITY_MISMATCH,
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
  // This GET generates and overwrites the account PAT. Never replay it through
  // another transport after a dispatched request may have succeeded.
  // https://github.com/QuantumNous/new-api/blob/v1.0.0-rc.22/controller/user.go
  const accessToken = await newApiFamilyRequests.data<string>(request, {
    endpoint: "/api/user/token",
    currentTabTransport: "disabled",
    tempWindowFallback: { statusCodes: [], codes: [] },
  })

  const normalizedAccessToken =
    typeof accessToken === "string" ? accessToken.trim() : ""

  if (!normalizedAccessToken) {
    throw new ApiError(
      t("messages:errors.api.invalidResponseFormat"),
      undefined,
      "/api/user/token",
    )
  }

  return normalizedAccessToken
}

/**
 * Return an existing access token or create one for New API-family accounts.
 */
export async function getOrCreateAccessToken(
  request: ApiServiceRequest,
  options?: {
    expectedUserId?: string
  },
): Promise<AccessTokenInfo> {
  const userInfo = await fetchUserInfo(request, options?.expectedUserId)

  let accessToken = userInfo.access_token

  if (!accessToken) {
    logger.info("访问令牌为空，尝试自动创建")
    accessToken = await createAccessToken(request)
    await fetchUserInfo(
      {
        ...request,
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken,
          userId: userInfo.id,
        },
        cookieAuthSessionCookie: undefined,
      },
      userInfo.id,
    )
    logger.info("自动创建访问令牌成功")
  }

  return {
    username: userInfo.username,
    access_token: accessToken,
  }
}

/** Read the New API-family switch from an already-loaded public status. */
export function extractCheckInSupport(
  siteStatus: SiteStatusInfo | null,
): boolean | undefined {
  return siteStatus?.checkin_enabled
}

/** Check default New API-family check-in support from public site status. */
export async function fetchSupportCheckIn(
  request: ApiServiceRequest,
  signal?: AbortSignal,
): Promise<boolean | undefined> {
  const siteStatus = await fetchSiteStatus(request, signal)
  return extractCheckInSupport(siteStatus)
}

export const defaultAccountBootstrapImplementation: AccountBootstrapImplementation =
  {
    fetchUserInfo,
    getOrCreateAccessToken,
    fetchSiteStatus,
    fetchSupportCheckIn,
    extractDefaultExchangeRate,
  }
