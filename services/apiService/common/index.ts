import i18next from "i18next"

import { UI_CONSTANTS } from "~/constants/ui"
import { accountStorage } from "~/services/accountStorage"
import { REQUEST_CONFIG } from "~/services/apiService/common/constant"
import { ApiError } from "~/services/apiService/common/errors"
import {
  AccessTokenInfo,
  AccountData,
  AuthTypeFetchParams,
  CreateTokenRequest,
  HealthCheckResult,
  LogResponseData,
  LogType,
  OpenAIAuthParams,
  PaginatedTokenResponse,
  PaymentResponse,
  PricingResponse,
  RedeemCodeRequest,
  RefreshAccountResult,
  SiteStatusInfo,
  TodayIncomeData,
  TodayUsageData,
  UpstreamModelItem,
  UpstreamModelList,
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
  type ApiToken,
} from "~/types"

// ============= 核心 API 函数 =============

/**
 * 获取用户基本信息（用于账号检测） - 使用浏览器 cookie 认证
 */
export const fetchUserInfo = async (baseUrl: string, userId?: number) => {
  const userData = await fetchApiData<UserInfo>({
    baseUrl,
    endpoint: "/api/user/self",
    userId,
    authType: AuthTypeEnum.Cookie,
  })

  return {
    id: userData.id,
    username: userData.username,
    access_token: userData.access_token || null,
    user: userData,
  }
}

/**
 * 创建访问令牌 - 使用浏览器 cookie 认证
 */
export const createAccessToken = async (
  baseUrl: string,
  userId: number,
): Promise<string> => {
  return await fetchApiData<string>({
    baseUrl,
    endpoint: "/api/user/token",
    userId,
    authType: AuthTypeEnum.Cookie,
  })
}

/**
 * 获取站点状态信息（包含充值比例）
 */
export const fetchSiteStatus = async (
  baseUrl: string,
  authType?: AuthTypeEnum,
): Promise<SiteStatusInfo | null> => {
  try {
    return await fetchApiData({
      baseUrl,
      endpoint: "/api/status",
      authType: authType || AuthTypeEnum.None,
    })
  } catch (error) {
    console.warn("获取站点状态信息失败:", error)
    return null
  }
}

/**
 * 从站点状态信息中提取默认充值比例
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
 * 获取支付信息
 * @note 此为 RIX_API 独有，放common为保证fallback
 * @param baseUrl
 * @param userId
 * @param accessToken
 * @param authType
 */
export const fetchPaymentInfo = async ({
  baseUrl,
  userId,
  token: accessToken,
  authType,
}: AuthTypeFetchParams): Promise<PaymentResponse> => {
  try {
    return await fetchApi<PaymentResponse>(
      {
        baseUrl,
        endpoint: "/api/user/payment",
        userId,
        token: accessToken,
        authType,
      },
      true,
    )
  } catch (error) {
    console.error("获取支付信息失败:", error)
    throw error
  }
}

/**
 * 自动获取或创建访问令牌
 */
export const getOrCreateAccessToken = async (
  baseUrl: string,
  userId: number,
): Promise<AccessTokenInfo> => {
  // 首先获取用户信息
  const userInfo = await fetchUserInfo(baseUrl, userId)

  let accessToken = userInfo.access_token

  // 如果没有访问令牌，则创建一个
  if (!accessToken) {
    console.log("访问令牌为空，尝试自动创建...")
    accessToken = await createAccessToken(baseUrl, userId)
    console.log("自动创建访问令牌成功")
  }

  return {
    username: userInfo.username,
    access_token: accessToken,
  }
}

/**
 * 获取账号余额信息
 */
export const fetchAccountQuota = async (
  baseUrl: string,
  userId: number,
  accessToken: string,
  authType?: AuthTypeEnum,
): Promise<number> => {
  const userData = await fetchApiData<{ quota?: number }>({
    baseUrl,
    endpoint: "/api/user/self",
    userId,
    token: accessToken,
    authType,
  })

  return userData.quota || 0
}

/**
 * 获取签到状态
 */
export const fetchCheckInStatus = async (
  baseUrl: string,
  userId: number,
  accessToken: string,
  authType?: AuthTypeEnum,
): Promise<boolean | undefined> => {
  try {
    const checkInData = await fetchApiData<{ can_check_in?: boolean }>({
      baseUrl,
      endpoint: "/api/user/check_in_status",
      userId,
      token: accessToken,
      authType,
    })
    // 仅当 can_check_in 明确为 true 或 false 时才返回，否则返回 undefined
    if (typeof checkInData.can_check_in === "boolean") {
      return checkInData.can_check_in
    }
    return undefined
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
 * 检查是否支持签到功能
 * @param baseUrl
 */
export const fetchSupportCheckIn = async (
  baseUrl: string,
): Promise<boolean | undefined> => {
  const siteStatus = await fetchSiteStatus(baseUrl)
  return siteStatus?.check_in_enabled
}

/**
 * 通用的分页日志获取与聚合函数
 * @param authParams - 认证参数
 * @param logTypes - 需要获取的日志类型数组
 * @param dataAggregator - 数据聚合函数
 * @param initialValue - 聚合结果的初始值
 * @param errorHandler - 错误处理函数
 * @returns 聚合后的结果
 */
const fetchPaginatedLogs = async <T>(
  authParams: AuthTypeFetchParams,
  logTypes: LogType[],
  dataAggregator: (accumulator: T, items: LogResponseData["items"]) => T,
  initialValue: T,
  errorHandler?: (error: unknown, logType: LogType) => void,
): Promise<T> => {
  const { baseUrl, userId, token: accessToken, authType } = authParams
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

        const logData = await fetchApiData<LogResponseData>({
          baseUrl,
          endpoint: `/api/log/self?${params.toString()}`,
          userId,
          token: accessToken,
          authType,
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
 * 获取今日使用情况
 */
export const fetchTodayUsage = async (
  authParams: AuthTypeFetchParams,
): Promise<TodayUsageData> => {
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
    authParams,
    [LogType.Consume],
    usageAggregator,
    initialState,
  )
}

/**
 * 获取今日收入情况
 */
export const fetchTodayIncome = async (
  authParams: AuthTypeFetchParams,
): Promise<TodayIncomeData> => {
  const { baseUrl, userId } = authParams
  let exchangeRate: number = UI_CONSTANTS.EXCHANGE_RATE.DEFAULT

  const account = await accountStorage.getAccountByBaseUrlAndUserId(
    baseUrl,
    userId,
  )
  if (account) {
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
    authParams,
    [LogType.Recharge, LogType.System],
    incomeAggregator,
    0,
    (error, logType) => {
      const typeName = logType === LogType.Recharge ? "充值" : "签到"
      console.warn(`获取${typeName}记录失败:`, error)
    },
  )

  return { today_income: totalIncome }
}

/**
 * 获取完整的账号数据
 */
export const fetchAccountData = async (
  baseUrl: string,
  userId: number,
  token: string,
  checkIn: CheckInConfig,
  authType?: AuthTypeEnum,
): Promise<AccountData> => {
  const params = { baseUrl, userId, token, authType, checkIn }
  const quotaPromise = fetchAccountQuota(baseUrl, userId, token, authType)
  const todayUsagePromise = fetchTodayUsage(params)
  const todayIncomePromise = fetchTodayIncome(params)
  const checkInPromise =
    checkIn?.enableDetection && !checkIn.customCheckInUrl
      ? fetchCheckInStatus(baseUrl, userId, token, authType)
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
      ...checkIn,
      isCheckedInToday: !(canCheckIn ?? true),
    },
  }
}

/**
 * 刷新单个账号数据
 */
export const refreshAccountData = async (
  baseUrl: string,
  userId: number,
  accessToken: string,
  checkIn: CheckInConfig,
  authType?: AuthTypeEnum,
): Promise<RefreshAccountResult> => {
  try {
    const data = await fetchAccountData(
      baseUrl,
      userId,
      accessToken,
      checkIn,
      authType,
    )
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
 * 验证账号连接性
 */
export const validateAccountConnection = async (
  baseUrl: string,
  userId: number,
  accessToken: string,
  authType?: AuthTypeEnum,
): Promise<boolean> => {
  try {
    await fetchAccountQuota(baseUrl, userId, accessToken, authType)
    return true
  } catch (error) {
    console.error("账号连接验证失败:", error)
    return false
  }
}

/**
 * 获取账号令牌列表
 */
export const fetchAccountTokens = async (
  { baseUrl, userId, token: accessToken, authType }: AuthTypeFetchParams,
  page: number = 0,
  size: number = 100,
): Promise<ApiToken[]> => {
  const params = new URLSearchParams({
    p: page.toString(),
    size: size.toString(),
  })

  try {
    // 尝试获取响应数据，可能是直接的数组或者分页对象
    const tokensData = await fetchApiData<ApiToken[] | PaginatedTokenResponse>({
      baseUrl,
      endpoint: `/api/token/?${params.toString()}`,
      userId,
      token: accessToken,
      authType,
    })

    // 处理不同的响应格式
    if (Array.isArray(tokensData)) {
      // 直接返回数组格式
      return tokensData
    } else if (
      tokensData &&
      typeof tokensData === "object" &&
      "items" in tokensData
    ) {
      // 分页格式，返回 items 数组
      return tokensData.items || []
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
 * 获取可用模型列表
 */
export const fetchAccountAvailableModels = async ({
  baseUrl,
  userId,
  token: accessToken,
  authType,
}: AuthTypeFetchParams): Promise<string[]> => {
  try {
    return await fetchApiData<string[]>({
      baseUrl,
      endpoint: "/api/user/models",
      userId,
      token: accessToken,
      authType,
    })
  } catch (error) {
    console.error("获取模型列表失败:", error)
    throw error
  }
}

/**
 * 获取站点Key的模型列表（OpenAI类型接口）
 * @param baseUrl
 * @param accessToken
 */
export const fetchUpstreamModels = async ({
  baseUrl,
  apiKey,
}: OpenAIAuthParams) => {
  try {
    return await fetchApiData<UpstreamModelList>({
      baseUrl,
      endpoint: "/v1/models",
      token: apiKey,
    })
  } catch (error) {
    console.error("获取上游模型列表失败:", error)
    throw error
  }
}

export const fetchUpstreamModelsNameList = async ({
  baseUrl,
  apiKey,
}: OpenAIAuthParams) => {
  const upstreamModels = await fetchUpstreamModels({
    baseUrl: baseUrl,
    apiKey: apiKey,
  })
  return upstreamModels.map((item: UpstreamModelItem) => item.id)
}

/**
 * 获取用户分组信息
 */
export const fetchUserGroups = async ({
  baseUrl,
  userId,
  token: accessToken,
  authType,
}: AuthTypeFetchParams): Promise<Record<string, UserGroupInfo>> => {
  try {
    return await fetchApiData<Record<string, UserGroupInfo>>({
      baseUrl,
      endpoint: "/api/user/self/groups",
      userId,
      token: accessToken,
      authType,
    })
  } catch (error) {
    console.error("获取分组信息失败:", error)
    throw error
  }
}

/**
 * 获取站点用户分组信息
 * @param {AuthTypeFetchParams} params
 * @param {string} params.baseUrl
 * @param {number} params.userId
 * @param {string} params.token
 * @param {AuthTypeEnum} [params.authType=AuthTypeEnum.None]
 * @returns {Promise<Array<string>>}
 * @throws {ApiError}
 */
export const fetchSiteUserGroups = async ({
  baseUrl,
  userId,
  token: accessToken,
  authType,
}: AuthTypeFetchParams): Promise<Array<string>> => {
  try {
    return await fetchApiData<Array<string>>({
      baseUrl,
      endpoint: "/api/group",
      userId,
      token: accessToken,
      authType,
    })
  } catch (error) {
    console.error("获取站点分组信息失败:", error)
    throw error
  }
}

/**
 * 创建新的API令牌
 */
export const createApiToken = async (
  baseUrl: string,
  userId: number,
  accessToken: string,
  tokenData: CreateTokenRequest,
  authType?: AuthTypeEnum,
): Promise<boolean> => {
  try {
    const response = await fetchApi<any>({
      baseUrl,
      endpoint: "/api/token/",
      userId,
      token: accessToken,
      authType,
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
 * 获取单个API令牌详情
 */
export const fetchTokenById = async (
  baseUrl: string,
  userId: number,
  accessToken: string,
  tokenId: number,
  authType?: AuthTypeEnum,
): Promise<ApiToken> => {
  try {
    return await fetchApiData<ApiToken>({
      baseUrl,
      endpoint: `/api/token/${tokenId}`,
      userId,
      token: accessToken,
      authType,
    })
  } catch (error) {
    console.error("获取令牌详情失败:", error)
    throw error
  }
}

/**
 * 更新API令牌
 */
export const updateApiToken = async (
  baseUrl: string,
  userId: number,
  accessToken: string,
  tokenId: number,
  tokenData: CreateTokenRequest,
  authType?: AuthTypeEnum,
): Promise<boolean> => {
  try {
    const response = await fetchApi<any>({
      baseUrl,
      endpoint: "/api/token/",
      userId,
      token: accessToken,
      authType,
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
 * 删除API令牌
 */
export const deleteApiToken = async (
  baseUrl: string,
  userId: number,
  accessToken: string,
  tokenId: number,
  authType?: AuthTypeEnum,
): Promise<boolean> => {
  try {
    const response = await fetchApi<any>({
      baseUrl,
      endpoint: `/api/token/${tokenId}`,
      userId,
      token: accessToken,
      authType,
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
 * 获取模型定价信息
 */
export const fetchModelPricing = async ({
  baseUrl,
  userId,
  token: accessToken,
  authType,
}: AuthTypeFetchParams): Promise<PricingResponse> => {
  try {
    // /api/pricing 接口直接返回 PricingResponse 格式，不需要通过 apiRequestData 包装
    return await fetchApi<PricingResponse>(
      {
        baseUrl,
        endpoint: "/api/pricing",
        userId,
        token: accessToken,
        authType,
      },
      true,
    )
  } catch (error) {
    console.error("获取模型定价失败:", error)
    throw error
  }
}

/**
 * 兑换码充值
 * @param baseUrl - 站点基础URL
 * @param userId - 用户ID
 * @param accessToken - 访问令牌
 * @param redemptionCode - 兑换码
 * @param authType - 认证类型
 * @returns 兑换获得的额度
 */
export const redeemCode = async (
  baseUrl: string,
  userId: number,
  accessToken: string,
  redemptionCode: string,
  authType?: AuthTypeEnum,
): Promise<number> => {
  try {
    const requestData: RedeemCodeRequest = {
      key: redemptionCode,
    }

    return await fetchApiData<number>({
      baseUrl,
      endpoint: "/api/user/topup",
      userId,
      token: accessToken,
      authType,
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
 * 根据错误判断健康状态
 */
export const determineHealthStatus = (error: any): HealthCheckResult => {
  if (error instanceof ApiError) {
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
      message: i18next.t("account:healthStatus.apiError"),
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
    message: i18next.t("account:healthStatus.unknownError"),
  }
}
