import i18next from "i18next"

import { UI_CONSTANTS } from "~/constants/ui"
import { accountStorage } from "~/services/accountStorage"
import { REQUEST_CONFIG } from "~/services/apiService/common/constant"
import { API_ERROR_CODES, ApiError } from "~/services/apiService/common/errors"
import { fetchAllItems } from "~/services/apiService/common/pagination"
import {
  AccessTokenInfo,
  AccountData,
  ApiServiceAccountRequest,
  ApiServiceRequest,
  CheckInStatus,
  CreateTokenRequest,
  HealthCheckResult,
  LogResponseData,
  LogType,
  PaginatedTokenResponse,
  PaymentResponse,
  PricingResponse,
  RedeemCodeRequest,
  RefreshAccountResult,
  SiteStatusInfo,
  TodayIncomeData,
  TodayUsageData,
  UserGroupInfo,
  UserInfo,
} from "~/services/apiService/common/type"
import {
  aggregateUsageData,
  extractAmount,
  fetchApi,
  fetchApiData,
  getTodayTimestampRange,
} from "~/services/apiService/common/utils"
import {
  AuthTypeEnum,
  CheckInConfig,
  SiteHealthStatus,
  TEMP_WINDOW_HEALTH_STATUS_CODES,
  type ApiToken,
} from "~/types"
import type {
  CreateChannelPayload,
  ManagedSiteChannel,
  ManagedSiteChannelListData,
  UpdateChannelPayload,
} from "~/types/managedSite"
import { normalizeApiTokenKey } from "~/utils/apiKey"

const CHANNEL_API_BASE = "/api/channel/"

/**
 * 搜索指定关键词的渠道。
 * @param request ApiServiceRequest（包含 baseUrl + 认证信息）。
 * @param keyword 搜索关键词。
 */
export async function searchChannel(
  request: ApiServiceRequest,
  keyword: string,
): Promise<ManagedSiteChannelListData | null> {
  try {
    return await fetchApiData<ManagedSiteChannelListData>(request, {
      endpoint: `${CHANNEL_API_BASE}search?keyword=${encodeURIComponent(keyword)}`,
    })
  } catch (error) {
    if (error instanceof ApiError) {
      console.error(`API 请求失败: ${error.message}`)
    } else {
      console.error("搜索渠道失败:", error)
    }
    return null
  }
}

/**
 * 创建新渠道。
 * @param request ApiServiceRequest（包含 baseUrl + 认证信息）。
 * @param channelData 渠道数据。
 */
export async function createChannel(
  request: ApiServiceRequest,
  channelData: CreateChannelPayload,
) {
  try {
    const payload = {
      ...channelData,
      channel: {
        ...channelData.channel,
        group: channelData?.channel?.groups?.join(","),
      },
    }

    return await fetchApi<void>(request, {
      endpoint: CHANNEL_API_BASE,
      options: {
        method: "POST",
        body: JSON.stringify(payload),
      },
    })
  } catch (error) {
    console.error("创建渠道失败:", error)
    throw new Error("创建渠道失败，请检查网络或 New API 配置。")
  }
}

/**
 * 更新新渠道。
 * @param request ApiServiceRequest（包含 baseUrl + 认证信息）。
 * @param channelData 渠道数据。
 */
export async function updateChannel(
  request: ApiServiceRequest,
  channelData: UpdateChannelPayload,
) {
  try {
    return await fetchApi<void>(request, {
      endpoint: CHANNEL_API_BASE,
      options: {
        method: "PUT",
        body: JSON.stringify(channelData),
      },
    })
  } catch (error) {
    console.error("更新渠道失败:", error)
    throw new Error("更新渠道失败，请检查网络或 New API 配置。")
  }
}

/**
 * 删除渠道。
 * @param request ApiServiceRequest（包含 baseUrl + 认证信息）。
 * @param channelId 渠道 ID。
 */
export async function deleteChannel(
  request: ApiServiceRequest,
  channelId: number,
) {
  try {
    return await fetchApi<void>(request, {
      endpoint: `${CHANNEL_API_BASE}${channelId}`,
      options: {
        method: "DELETE",
      },
    })
  } catch (error) {
    console.error("删除渠道失败:", error)
    throw new Error("删除渠道失败，请检查网络或 New API 配置。")
  }
}

type ChannelListAllOptions = {
  pageSize?: number
  beforeRequest?: () => Promise<void>
  endpoint?: string
  pageStart?: number
}

/**
 * Fetch all channels from New API with pagination aggregation.
 *
 * Notes:
 * - Aggregates `type_counts` across pages.
 * - Uses the first page's `total` as the authoritative total when later pages omit it.
 * - Optionally invokes a `beforeRequest` hook (e.g. rate limiter) before each page request.
 * @param request ApiServiceRequest（包含 baseUrl + 认证信息）。
 * @param options Additional pagination options.
 */
export async function listAllChannels(
  request: ApiServiceRequest,
  options?: ChannelListAllOptions,
): Promise<ManagedSiteChannelListData> {
  const pageSize = options?.pageSize ?? REQUEST_CONFIG.DEFAULT_PAGE_SIZE
  const beforeRequest = options?.beforeRequest
  const endpoint = options?.endpoint ?? CHANNEL_API_BASE
  const pageStart = options?.pageStart ?? 1

  let total = 0
  const typeCounts: Record<string, number> = {}

  const items = await fetchAllItems<ManagedSiteChannel>(
    async (page) => {
      const params = new URLSearchParams({
        p: page.toString(),
        page_size: pageSize.toString(),
      })

      await beforeRequest?.()

      const response = await fetchApi<ManagedSiteChannelListData>(
        request,
        { endpoint: `${endpoint}?${params.toString()}` },
        false,
      )

      if (!response.success || !response.data) {
        throw new ApiError(
          response.message || "Failed to fetch channels",
          undefined,
          endpoint,
        )
      }

      const { data } = response
      if (page === pageStart) {
        total = data.total || data.items.length || 0
        Object.assign(typeCounts, data.type_counts || {})
      } else if (data.type_counts) {
        for (const [key, value] of Object.entries(data.type_counts)) {
          typeCounts[key] = (typeCounts[key] || 0) + value
        }
      }

      return {
        items: data.items || [],
        total: total || 0,
      }
    },
    { pageSize, startPage: pageStart },
  )

  return {
    items,
    total,
    type_counts: typeCounts,
  } as ManagedSiteChannelListData
}

/**
 * Fetch raw model list for a given channel.
 * @param request ApiServiceRequest（包含 baseUrl + 认证信息）。
 * @param channelId Target channel id.
 */
export async function fetchChannelModels(
  request: ApiServiceRequest,
  channelId: number,
): Promise<string[]> {
  const response = await fetchApi<string[]>(
    request,
    { endpoint: `${CHANNEL_API_BASE}fetch_models/${channelId}` },
    false,
  )

  if (!response.success || !Array.isArray(response.data)) {
    throw new ApiError(
      response.message || "Failed to fetch models",
      undefined,
      `${CHANNEL_API_BASE}fetch_models/${channelId}`,
    )
  }

  return response.data
}

/**
 * Update the `models` field for a channel.
 * @param request ApiServiceRequest（包含 baseUrl + 认证信息）。
 * @param channelId Channel id.
 * @param models Comma-separated model list.
 */
export async function updateChannelModels(
  request: ApiServiceRequest,
  channelId: number,
  models: string,
): Promise<void> {
  const payload: UpdateChannelPayload = {
    id: channelId,
    models,
  }

  const response = await fetchApi<void>(
    request,
    {
      endpoint: CHANNEL_API_BASE,
      options: {
        method: "PUT",
        body: JSON.stringify(payload),
      },
    },
    false,
  )

  if (!response.success) {
    throw new ApiError(
      response.message || "Failed to update channel",
      undefined,
    )
  }
}

/**
 * Update the `models` and `model_mapping` fields for a channel.
 * @param request ApiServiceRequest（包含 baseUrl + 认证信息）。
 * @param channelId Channel id.
 * @param models Comma-separated model list.
 * @param modelMappingJson Stringified mapping JSON.
 */
export async function updateChannelModelMapping(
  request: ApiServiceRequest,
  channelId: number,
  models: string,
  modelMappingJson: string,
): Promise<void> {
  const payload: UpdateChannelPayload = {
    id: channelId,
    models,
    model_mapping: modelMappingJson,
  }

  const response = await fetchApi<void>(
    request,
    {
      endpoint: CHANNEL_API_BASE,
      options: {
        method: "PUT",
        body: JSON.stringify(payload),
      },
    },
    false,
  )

  if (!response.success) {
    throw new ApiError(
      response.message || "Failed to update channel mapping",
      undefined,
    )
  }
}

/**
 * Fetch basic user info for account detection using cookie auth.
 * @param request ApiServiceRequest (cookie-auth).
 * @returns Minimal user profile plus access token if present.
 */
export async function fetchUserInfo(request: ApiServiceRequest): Promise<{
  id: number
  username: string
  access_token: string
  user: UserInfo
}> {
  const userData = await fetchApiData<UserInfo>(request, {
    endpoint: "/api/user/self",
  })

  return {
    id: userData.id,
    username: userData.username,
    access_token: userData.access_token || "",
    user: userData,
  }
}

/**
 * Create an access token using cookie auth for the given user.
 * @param request ApiServiceRequest (cookie-auth).
 * @returns Newly created access token string.
 */
export async function createAccessToken(
  request: ApiServiceRequest,
): Promise<string> {
  return await fetchApiData<string>(request, {
    endpoint: "/api/user/token",
  })
}

/**
 * Fetch site status (includes pricing/exchange data).
 * Always treated as a public endpoint (authType forced to `None`).
 * @returns Site status info or null when unavailable.
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
    console.warn("获取站点状态信息失败:", error)
    return null
  }
}

/**
 * Extract default exchange rate (USD) from status info with fallback order.
 * @param statusInfo Site status response.
 * @returns Preferred numeric rate or null if absent.
 */
export const extractDefaultExchangeRate = (
  statusInfo: SiteStatusInfo | null,
): number | null => {
  if (!statusInfo) {
    return null
  }

  // 优先使用 price
  if (statusInfo.price && statusInfo.price > 0) {
    return statusInfo.price
  }

  // 次选 stripe_unit_price
  if (statusInfo.stripe_unit_price && statusInfo.stripe_unit_price > 0) {
    return statusInfo.stripe_unit_price
  }

  // 兼容 done-hub 和 one-hub
  if (statusInfo.PaymentUSDRate && statusInfo.PaymentUSDRate > 0) {
    return statusInfo.PaymentUSDRate
  }

  return null
}

/**
 * Fetch payment info (RIX_API specific; kept in common for fallback).
 * @param request ApiServiceRequest.
 * @returns Payment summary from backend.
 */
export async function fetchPaymentInfo(
  request: ApiServiceRequest,
): Promise<PaymentResponse> {
  try {
    return await fetchApi<PaymentResponse>(
      request,
      { endpoint: "/api/user/payment" },
      true,
    )
  } catch (error) {
    console.error("获取支付信息失败:", error)
    throw error
  }
}

/**
 * Get existing access token or create one via cookie-auth fallback.
 * @param request ApiServiceRequest (cookie-auth).
 * @returns Username + access token (newly created if missing).
 */
export async function getOrCreateAccessToken(
  request: ApiServiceRequest,
): Promise<AccessTokenInfo> {
  // 首先获取用户信息
  const userInfo = await fetchUserInfo(request)

  let accessToken = userInfo.access_token

  // 如果没有访问令牌，则创建一个
  if (!accessToken) {
    console.log("访问令牌为空，尝试自动创建...")
    accessToken = await createAccessToken(request)
    console.log("自动创建访问令牌成功")
  }

  return {
    username: userInfo.username,
    access_token: accessToken,
  }
}

/**
 * Fetch account quota/balance.
 * @param request ApiServiceRequest.
 * @returns Remaining quota (0 if missing).
 */
export async function fetchAccountQuota(
  request: ApiServiceRequest,
): Promise<number> {
  const userData = await fetchApiData<{ quota?: number }>(request, {
    endpoint: "/api/user/self",
  })

  return userData.quota || 0
}

/**
 * Fetch check-in capability for the user.
 * @param request ApiServiceRequest.
 * @returns True/false when available; undefined if unsupported or errors.
 */
export async function fetchCheckInStatus(
  request: ApiServiceRequest,
): Promise<boolean | undefined> {
  const currentMonth = new Date().toISOString().slice(0, 7)
  try {
    const checkInData = await fetchApiData<CheckInStatus>(request, {
      endpoint: `/api/user/checkin?month=${currentMonth}`,
    })
    // 返回今天是否已签到的状态
    return !checkInData.stats.checked_in_today
  } catch (error) {
    // 如果接口不存在或返回错误（如 404 Not Found），则认为不支持签到功能
    if (
      error instanceof ApiError &&
      (error.statusCode === 404 || error.statusCode === 500)
    ) {
      return undefined
    }
    console.warn("获取签到状态失败:", error)
    return undefined // 其他错误也视为不支持
  }
}

/**
 * Check if site supports check-in based on status info.
 * @param request ApiServiceRequest.
 * @returns Whether check-in is enabled (undefined when unknown).
 */
export async function fetchSupportCheckIn(
  request: ApiServiceRequest,
): Promise<boolean | undefined> {
  const siteStatus = await fetchSiteStatus(request)
  return siteStatus?.checkin_enabled
}

/**
 * Fetch paginated logs and aggregate results.
 * @param request ApiServiceRequest.
 * @param logTypes Log categories to fetch.
 * @param dataAggregator Reducer to merge items into accumulator.
 * @param initialValue Initial accumulator value.
 * @param errorHandler Optional handler per log type error.
 * @returns Aggregated value after pagination.
 */
const fetchPaginatedLogs = async <T>(
  request: ApiServiceRequest,
  logTypes: LogType[],
  dataAggregator: (accumulator: T, items: LogResponseData["items"]) => T,
  initialValue: T,
  errorHandler?: (error: unknown, logType: LogType) => void,
): Promise<T> => {
  const { start: startTimestamp, end: endTimestamp } = getTodayTimestampRange()
  let aggregatedData = initialValue
  let maxPageReached = false

  for (const logType of logTypes) {
    try {
      let currentPage = 1
      while (currentPage <= REQUEST_CONFIG.MAX_PAGES) {
        const params = new URLSearchParams({
          p: currentPage.toString(),
          page_size: REQUEST_CONFIG.DEFAULT_PAGE_SIZE.toString(),
          type: String(logType),
          token_name: "",
          model_name: "",
          start_timestamp: startTimestamp.toString(),
          end_timestamp: endTimestamp.toString(),
          group: "",
        })

        const logData = await fetchApiData<LogResponseData>(request, {
          endpoint: `/api/log/self?${params.toString()}`,
        })

        const items = logData.items || []
        aggregatedData = dataAggregator(aggregatedData, items)

        const totalPages = Math.ceil(
          (logData.total || 0) / REQUEST_CONFIG.DEFAULT_PAGE_SIZE,
        )
        if (currentPage >= totalPages) {
          break
        }
        currentPage++
      }

      if (currentPage > REQUEST_CONFIG.MAX_PAGES) {
        maxPageReached = true
      }
    } catch (error) {
      if (errorHandler) {
        errorHandler(error, logType)
      } else {
        console.warn(`获取日志类型 ${logType} 失败:`, error)
      }
    }
  }

  if (maxPageReached) {
    console.warn(
      `达到最大分页限制(${REQUEST_CONFIG.MAX_PAGES}页)，数据可能不完整`,
    )
  }

  return aggregatedData
}

/**
 * Fetch today's usage (quota + token counts + request count).
 * @param request ApiServiceRequest.
 * @returns Usage totals for the current day.
 */
export async function fetchTodayUsage(
  request: ApiServiceRequest,
): Promise<TodayUsageData> {
  const initialState = {
    today_quota_consumption: 0,
    today_prompt_tokens: 0,
    today_completion_tokens: 0,
    today_requests_count: 0,
  }

  const usageAggregator = (
    accumulator: typeof initialState,
    items: LogResponseData["items"],
  ) => {
    const pageData = aggregateUsageData(items)
    accumulator.today_quota_consumption += pageData.today_quota_consumption
    accumulator.today_prompt_tokens += pageData.today_prompt_tokens
    accumulator.today_completion_tokens += pageData.today_completion_tokens
    accumulator.today_requests_count += items?.length || 0
    return accumulator
  }

  return fetchPaginatedLogs(
    request,
    [LogType.Consume],
    usageAggregator,
    initialState,
  )
}

/**
 * Fetch today's income (recharge/system logs).
 * @param request ApiServiceRequest.
 * @returns Total income amount for today.
 */
export async function fetchTodayIncome(
  request: ApiServiceRequest,
): Promise<TodayIncomeData> {
  const { baseUrl } = request
  const { userId } = request.auth
  let exchangeRate: number = UI_CONSTANTS.EXCHANGE_RATE.DEFAULT

  const account = request.accountId
    ? await accountStorage.getAccountById(request.accountId)
    : userId === undefined
      ? null
      : await accountStorage.getAccountByBaseUrlAndUserId(baseUrl, userId)

  if (account?.exchange_rate) {
    exchangeRate = account.exchange_rate
  }
  const incomeAggregator = (
    accumulator: number,
    items: LogResponseData["items"],
  ) => {
    return (
      accumulator +
      (items?.reduce(
        (sum, item) =>
          sum +
          (item.quota ||
            UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR *
              (extractAmount(item.content, exchangeRate)?.amount ?? 0)),
        0,
      ) || 0)
    )
  }

  const totalIncome = await fetchPaginatedLogs(
    request,
    [LogType.Topup, LogType.System],
    incomeAggregator,
    0,
    (error, logType) => {
      const typeName = logType === LogType.Topup ? "充值" : "签到"
      console.warn(`获取${typeName}记录失败:`, error)
    },
  )

  return { today_income: totalIncome }
}

/**
 * Fetch full account snapshot (quota, usage, income, check-in).
 * @param request ApiServiceRequest (use `request.checkIn` for check-in config).
 * @returns Aggregated account data with check-in state.
 */
export async function fetchAccountData(
  request: ApiServiceAccountRequest,
): Promise<AccountData> {
  const resolvedCheckIn: CheckInConfig = request.checkIn

  const quotaPromise = fetchAccountQuota(request)
  const todayUsagePromise = fetchTodayUsage(request)
  const todayIncomePromise = fetchTodayIncome(request)
  const checkInPromise = resolvedCheckIn?.enableDetection
    ? fetchCheckInStatus(request)
    : Promise.resolve<boolean | undefined>(undefined)

  const [quota, todayUsage, todayIncome, canCheckIn] = await Promise.all([
    quotaPromise,
    todayUsagePromise,
    todayIncomePromise,
    checkInPromise,
  ])

  return {
    quota,
    ...todayUsage,
    ...todayIncome,
    checkIn: {
      ...resolvedCheckIn,
      siteStatus: {
        ...(resolvedCheckIn.siteStatus ?? {}),
        isCheckedInToday: !(canCheckIn ?? true),
      },
    },
  }
}

/**
 * Refresh a single account's data and return health status.
 * @param request ApiServiceRequest (use `request.checkIn` for check-in config).
 * @returns Success flag, data (when success), and health status.
 */
export async function refreshAccountData(
  request: ApiServiceAccountRequest,
): Promise<RefreshAccountResult> {
  try {
    const data = await fetchAccountData(request)
    return {
      success: true,
      data,
      healthStatus: {
        status: SiteHealthStatus.Healthy,
        message: i18next.t("account:healthStatus.normal"),
      },
    }
  } catch (error) {
    console.error("刷新账号数据失败:", error)
    return {
      success: false,
      healthStatus: determineHealthStatus(error),
    }
  }
}

/**
 * Validate account connectivity by fetching quota.
 * @param request ApiServiceRequest.
 * @returns True if quota fetch succeeds, else false.
 */
export async function validateAccountConnection(
  request: ApiServiceRequest,
): Promise<boolean> {
  try {
    await fetchAccountQuota(request)
    return true
  } catch (error) {
    console.error("账号连接验证失败:", error)
    return false
  }
}

/**
 * Fetch the API token list for a user and normalize multiple response shapes.
 *
 * Some upstreams return a simple array, while others wrap the data in a
 * paginated envelope. This helper hides those differences and always returns
 * a flat array so the UI can treat both responses identically.
 * @param request ApiServiceRequest.
 * @param page Pagination index (defaults to first page).
 * @param size Page size in records (defaults to 100, matching upstream default).
 * @returns Normalized list of API tokens.
 */
export async function fetchAccountTokens(
  request: ApiServiceRequest,
  page: number = 0,
  size: number = 100,
): Promise<ApiToken[]> {
  const searchParams = new URLSearchParams({
    p: page.toString(),
    size: size.toString(),
  })

  try {
    // 尝试获取响应数据，可能是直接的数组或者分页对象
    const tokensData = await fetchApiData<ApiToken[] | PaginatedTokenResponse>(
      request,
      {
        endpoint: `/api/token/?${searchParams.toString()}`,
      },
    )

    // 处理不同的响应格式
    if (Array.isArray(tokensData)) {
      // 直接返回数组格式
      return tokensData.map(normalizeApiTokenKey)
    } else if (
      tokensData &&
      typeof tokensData === "object" &&
      "items" in tokensData
    ) {
      // 分页格式，返回 items 数组
      return (tokensData.items || []).map(normalizeApiTokenKey)
    } else {
      // 其他情况，返回空数组
      console.warn("Unexpected token response format:", tokensData)
      return []
    }
  } catch (error) {
    console.error("获取令牌列表失败:", error)
    throw error
  }
}

/**
 * Fetch the list of downstream model identifiers that an account can access.
 *
 * This hits `/api/user/models`, which typically returns a flat array of model
 * IDs that should be displayed to the user when configuring per-account model
 * visibility.
 * @param request ApiServiceRequest.
 * @returns Array of model identifiers allowed for the account.
 */
export async function fetchAccountAvailableModels(
  request: ApiServiceRequest,
): Promise<string[]> {
  try {
    return await fetchApiData<string[]>(request, {
      endpoint: "/api/user/models",
    })
  } catch (error) {
    console.error("获取模型列表失败:", error)
    throw error
  }
}

/**
 * Fetch user-group assignments for the authenticated account.
 *
 * The upstream returns a record keyed by group name with metadata describing
 * entitlements. Consumers use this to render per-account permissions.
 * @param request ApiServiceRequest.
 * @returns Mapping of group names to metadata.
 */
export async function fetchUserGroups(
  request: ApiServiceRequest,
): Promise<Record<string, UserGroupInfo>> {
  try {
    return await fetchApiData<Record<string, UserGroupInfo>>(request, {
      endpoint: "/api/user/self/groups",
    })
  } catch (error) {
    console.error("获取分组信息失败:", error)
    throw error
  }
}

/**
 * Fetch the complete list of user groups defined on the site.
 *
 * Unlike {@link fetchUserGroups}, this endpoint returns every group identifier
 * (not just those tied to the current user) and is primarily used for admin
 * UI when editing assignments.
 * @param request ApiServiceRequest.
 * @returns Array of group IDs available on the site.
 * @throws {ApiError} when the upstream response fails.
 */
export async function fetchSiteUserGroups(
  request: ApiServiceRequest,
): Promise<Array<string>> {
  try {
    return await fetchApiData<Array<string>>(request, {
      endpoint: "/api/group",
    })
  } catch (error) {
    console.error("获取站点分组信息失败:", error)
    throw error
  }
}

/**
 * Create a new API token for the specified account.
 * @param request ApiServiceRequest.
 * @param tokenData Form payload describing the token (scopes, name, etc.).
 * @returns True when the upstream confirms `success === true`.
 * @throws {ApiError} if the server reports a failure.
 */
export async function createApiToken(
  request: ApiServiceRequest,
  tokenData: CreateTokenRequest,
): Promise<boolean> {
  try {
    const response = await fetchApi<any>(request, {
      endpoint: "/api/token/",
      options: {
        method: "POST",
        body: JSON.stringify(tokenData),
      },
    })

    // 对于创建令牌的响应，只检查success字段，不要求data字段存在
    if (!response.success) {
      throw new ApiError(
        response.message || "创建令牌失败",
        undefined,
        "/api/token",
      )
    }

    return true
  } catch (error) {
    console.error("创建令牌失败:", error)
    throw error
  }
}

/**
 * Fetch a single API token by its identifier.
 * @param request ApiServiceRequest.
 * @param tokenId Token identifier to retrieve.
 * @returns Detailed token representation from upstream.
 * @throws {ApiError} when the backend reports a failure.
 */
export async function fetchTokenById(
  request: ApiServiceRequest,
  tokenId: number,
): Promise<ApiToken> {
  try {
    const token = await fetchApiData<ApiToken>(request, {
      endpoint: `/api/token/${tokenId}`,
    })
    return normalizeApiTokenKey(token)
  } catch (error) {
    console.error("获取令牌详情失败:", error)
    throw error
  }
}

/**
 * Update an existing API token in place.
 * @param request ApiServiceRequest.
 * @param tokenId Identifier of the token being updated.
 * @param tokenData Updated fields (name/scopes/etc.).
 * @returns True when upstream returns `success === true`.
 * @throws {ApiError} if the update fails upstream.
 */
export async function updateApiToken(
  request: ApiServiceRequest,
  tokenId: number,
  tokenData: CreateTokenRequest,
): Promise<boolean> {
  try {
    const response = await fetchApi<any>(request, {
      endpoint: "/api/token/",
      options: {
        method: "PUT",
        body: JSON.stringify({ ...tokenData, id: tokenId }),
      },
    })

    if (!response.success) {
      throw new ApiError(
        response.message || "更新令牌失败",
        undefined,
        "/api/token",
      )
    }

    return true
  } catch (error) {
    console.error("更新令牌失败:", error)
    throw error
  }
}

/**
 * Delete an API token permanently.
 * @param request ApiServiceRequest.
 * @param tokenId Identifier of the token to delete.
 * @returns True when the deletion succeeds upstream.
 * @throws {ApiError} when the backend reports failure.
 */
export async function deleteApiToken(
  request: ApiServiceRequest,
  tokenId: number,
): Promise<boolean> {
  try {
    const response = await fetchApi<any>(request, {
      endpoint: `/api/token/${tokenId}`,
      options: {
        method: "DELETE",
      },
    })

    if (!response.success) {
      throw new ApiError(
        response.message || "删除令牌失败",
        undefined,
        `/api/token/${tokenId}`,
      )
    }

    return true
  } catch (error) {
    console.error("删除令牌失败:", error)
    throw error
  }
}

/**
 * Fetch model pricing metadata for the authenticated account.
 *
 * The `/api/pricing` endpoint returns a rich `PricingResponse` payload; unlike
 * other helpers we use `fetchApi` directly because the upstream is already in
 * the desired shape and may include additional metadata beyond `data`.
 * @param request ApiServiceRequest.
 * @returns Pricing response as provided by upstream.
 */
export async function fetchModelPricing(
  request: ApiServiceRequest,
): Promise<PricingResponse> {
  try {
    // /api/pricing 接口直接返回 PricingResponse 格式，不需要通过 apiRequestData 包装
    return await fetchApi<PricingResponse>(
      request,
      { endpoint: "/api/pricing" },
      true,
    )
  } catch (error) {
    console.error("获取模型定价失败:", error)
    throw error
  }
}

/**
 * Redeem a code to top up account quota.
 * @param request ApiServiceRequest.
 * @param redemptionCode Redemption code string.
 * @returns Amount of quota redeemed.
 * @throws {ApiError} when redemption fails upstream.
 */
export async function redeemCode(
  request: ApiServiceRequest,
  redemptionCode: string,
): Promise<number> {
  try {
    const requestData: RedeemCodeRequest = {
      key: redemptionCode,
    }

    return await fetchApiData<number>(request, {
      endpoint: "/api/user/topup",
      options: {
        method: "POST",
        body: JSON.stringify(requestData),
      },
    })
  } catch (error) {
    console.error("兑换码充值失败:", error)
    throw error
  }
}

// ============= 健康状态判断 =============

/**
 * Map runtime errors to the user-facing health status shown in the dashboard.
 *
 * - API errors with HTTP response codes become `Warning` with rich messaging.
 * - API errors without HTTP codes (schema issues, etc.) render as `Unknown`.
 * - Network-level `TypeError`s become `Error` to highlight connectivity issues.
 * - Any other error falls back to `Unknown` to avoid misleading the user.
 * @param error Arbitrary runtime error thrown during refresh.
 * @returns Health status object suitable for persistence + UI display.
 */
export const determineHealthStatus = (error: any): HealthCheckResult => {
  if (error instanceof ApiError) {
    // Temp-window fallback was eligible, but blocked by user config or permissions.
    // Surface a direct reminder so the health tooltip can guide the user.
    if (error.code === API_ERROR_CODES.TEMP_WINDOW_DISABLED) {
      return {
        status: SiteHealthStatus.Warning,
        message: i18next.t("account:healthStatus.tempWindowDisabled"),
        code: TEMP_WINDOW_HEALTH_STATUS_CODES.DISABLED,
      }
    }
    if (error.code === API_ERROR_CODES.TEMP_WINDOW_PERMISSION_REQUIRED) {
      return {
        status: SiteHealthStatus.Warning,
        message: i18next.t("account:healthStatus.tempWindowPermissionRequired"),
        code: TEMP_WINDOW_HEALTH_STATUS_CODES.PERMISSION_REQUIRED,
      }
    }

    // HTTP响应码不为200的情况
    if (error.statusCode) {
      return {
        status: SiteHealthStatus.Warning,
        message: i18next.t("account:healthStatus.httpError", {
          statusCode: error.statusCode,
          message: error.message,
        }),
      }
    }
    // 其他API错误（数据格式错误等）
    return {
      status: SiteHealthStatus.Unknown,
      message: error.message || i18next.t("account:healthStatus.apiError"),
    }
  }

  // 网络连接失败、超时等HTTP请求失败的情况
  if (error instanceof TypeError && error.message.includes("fetch")) {
    return {
      status: SiteHealthStatus.Error,
      message: i18next.t("account:healthStatus.networkFailed"),
    }
  }

  // 其他未知错误
  return {
    status: SiteHealthStatus.Unknown,
    message: error.message || i18next.t("account:healthStatus.unknownError"),
  }
}
