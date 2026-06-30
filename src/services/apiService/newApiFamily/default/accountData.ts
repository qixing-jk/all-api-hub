import { UI_CONSTANTS } from "~/constants/ui"
import type {
  AccountData,
  ApiServiceAccountRequest,
  TodayIncomeData,
  TodayUsageData,
} from "~/services/accounts/accountDataModel"
import type { NewApiCheckInStatus } from "~/services/apiService/newApiFamily/checkInDto"
import {
  aggregateUsageData,
  extractAmount,
  getTodayTimestampRange,
} from "~/services/apiService/newApiFamily/default/accountDataUtils"
import { REQUEST_CONFIG } from "~/services/apiTransport/constant"
import { ApiError } from "~/services/apiTransport/errors"
import { fetchApiData } from "~/services/apiTransport/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { LogType } from "~/services/history/usageHistory/usageLogModel"
import type {
  LogItem,
  LogResponseData,
  LogStatResponseData,
  TodayLogQueryConfig,
} from "~/services/history/usageHistory/usageLogModel"
import type { CheckInConfig } from "~/types"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("NewApiFamilyAccountData")

const EMPTY_TODAY_USAGE: TodayUsageData = {
  today_quota_consumption: 0,
  today_prompt_tokens: 0,
  today_completion_tokens: 0,
  today_requests_count: 0,
}

const DEFAULT_TODAY_LOG_QUERY_CONFIG: Required<
  Omit<TodayLogQueryConfig, "extraParams">
> & {
  extraParams: Record<string, string>
} = {
  endpoint: "/api/log/self",
  pageParamName: "p",
  pageSizeParamName: "page_size",
  logTypeParamName: "type",
  itemsField: "items",
  totalField: "total",
  includeGroupParam: true,
  extraParams: {},
}

interface AccountDataImplementation {
  fetchAccountData: (request: ApiServiceAccountRequest) => Promise<AccountData>
}

/**
 * Fetch default New API-family account quota/balance.
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
 * Fetch default New API-family check-in capability for the user.
 * @param request ApiServiceRequest.
 * @returns True/false when available; undefined if unsupported or errors.
 */
export async function fetchCheckInStatus(
  request: ApiServiceRequest,
): Promise<boolean | undefined> {
  const currentMonth = new Date().toISOString().slice(0, 7)
  try {
    const checkInData = await fetchApiData<NewApiCheckInStatus>(request, {
      endpoint: `/api/user/checkin?month=${currentMonth}`,
    })
    return !checkInData.stats.checked_in_today
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.statusCode === 404 || error.statusCode === 500)
    ) {
      return undefined
    }
    logger.warn("获取签到状态失败", error)
    return undefined
  }
}

/**
 * Merge backend-specific today-log overrides with the default query config.
 * @param config Optional endpoint/query customization for backend variants.
 * @returns Normalized today-log query configuration.
 */
const resolveTodayLogQueryConfig = (
  config?: TodayLogQueryConfig,
): typeof DEFAULT_TODAY_LOG_QUERY_CONFIG => ({
  ...DEFAULT_TODAY_LOG_QUERY_CONFIG,
  ...config,
  extraParams: {
    ...DEFAULT_TODAY_LOG_QUERY_CONFIG.extraParams,
    ...(config?.extraParams ?? {}),
  },
})

/**
 * Build a normalized "today logs" query string for compatible backends.
 * @param logType Log category to request.
 * @param params Optional pagination overrides.
 * @param params.page Page number override.
 * @param params.pageSize Page size override.
 * @param config Optional endpoint/query customization for backend variants.
 */
const buildTodayLogQueryParams = (
  logType: LogType,
  params?: {
    page?: number
    pageSize?: number
  },
  config?: TodayLogQueryConfig,
) => {
  const { start: startTimestamp, end: endTimestamp } = getTodayTimestampRange()
  const resolvedConfig = resolveTodayLogQueryConfig(config)

  const searchParams = new URLSearchParams({
    [resolvedConfig.pageParamName]: String(params?.page ?? 1),
    [resolvedConfig.pageSizeParamName]: String(
      params?.pageSize ?? REQUEST_CONFIG.DEFAULT_PAGE_SIZE,
    ),
    token_name: "",
    model_name: "",
    start_timestamp: String(startTimestamp),
    end_timestamp: String(endTimestamp),
  })

  if (resolvedConfig.logTypeParamName) {
    searchParams.set(resolvedConfig.logTypeParamName, String(logType))
  }

  if (resolvedConfig.includeGroupParam) {
    searchParams.set("group", "")
  }

  for (const [key, value] of Object.entries(resolvedConfig.extraParams)) {
    searchParams.set(key, value)
  }

  return searchParams
}

/**
 * Fetch paginated logs and aggregate results for the current day.
 * @param request ApiServiceRequest.
 * @param logTypes Log categories to fetch.
 * @param dataAggregator Reducer to merge items into accumulator.
 * @param initialValue Initial accumulator value.
 * @param errorHandler Optional handler per log type error.
 * @param queryConfig Optional override for non-standard log pagination APIs.
 * @returns Aggregated value after pagination.
 */
const fetchPaginatedLogs = async <T>(
  request: ApiServiceRequest,
  logTypes: LogType[],
  dataAggregator: (accumulator: T, items: LogResponseData["items"]) => T,
  initialValue: T,
  errorHandler?: (error: unknown, logType: LogType) => void,
  queryConfig?: TodayLogQueryConfig,
): Promise<T> => {
  let aggregatedData = initialValue
  let maxPageReached = false
  const resolvedQueryConfig = resolveTodayLogQueryConfig(queryConfig)

  const normalizeLogResponse = (
    payload: LogResponseData | LogItem[],
  ): {
    items: LogItem[]
    total: number | null
  } => {
    if (Array.isArray(payload)) {
      return {
        items: payload,
        total: null,
      }
    }

    const payloadRecord = payload as unknown as Record<string, unknown>
    const itemsValue = payloadRecord[resolvedQueryConfig.itemsField]
    const totalValue = payloadRecord[resolvedQueryConfig.totalField]

    return {
      items: Array.isArray(itemsValue) ? (itemsValue as LogItem[]) : [],
      total:
        typeof totalValue === "number" && Number.isFinite(totalValue)
          ? totalValue
          : null,
    }
  }

  for (const logType of logTypes) {
    try {
      let currentPage = 1
      while (currentPage <= REQUEST_CONFIG.MAX_PAGES) {
        const params = buildTodayLogQueryParams(
          logType,
          {
            page: currentPage,
            pageSize: REQUEST_CONFIG.DEFAULT_PAGE_SIZE,
          },
          resolvedQueryConfig,
        )

        const logData = await fetchApiData<LogResponseData | LogItem[]>(
          request,
          {
            endpoint: `${resolvedQueryConfig.endpoint}?${params.toString()}`,
          },
        )

        const normalizedLogData = normalizeLogResponse(logData)
        const items = normalizedLogData.items
        aggregatedData = dataAggregator(aggregatedData, items)

        const totalPages =
          normalizedLogData.total === null
            ? 1
            : Math.ceil(
                normalizedLogData.total / REQUEST_CONFIG.DEFAULT_PAGE_SIZE,
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
        logger.warn("获取日志类型失败", { logType, error })
      }
    }
  }

  if (maxPageReached) {
    logger.warn("达到最大分页限制，数据可能不完整", {
      maxPages: REQUEST_CONFIG.MAX_PAGES,
    })
  }

  return aggregatedData
}

/**
 * Build "today consume logs" query params using the optional backend override.
 * @param params Optional pagination overrides.
 * @param params.page Page number override.
 * @param params.pageSize Page size override.
 * @param queryConfig Optional endpoint/query customization for backend variants.
 */
const buildTodayConsumeLogParams = (
  params?: {
    page?: number
    pageSize?: number
  },
  queryConfig?: TodayLogQueryConfig,
) => buildTodayLogQueryParams(LogType.Consume, params, queryConfig)

/**
 * Legacy full aggregation path for today's usage metrics.
 * @param request ApiServiceAccountRequest.
 * @param queryConfig Optional override for non-standard log pagination APIs.
 * @returns Fully aggregated quota, token, and request totals.
 */
const fetchTodayUsageFromLogs = async (
  request: ApiServiceAccountRequest,
  queryConfig?: TodayLogQueryConfig,
): Promise<TodayUsageData> => {
  const usageAggregator = (
    accumulator: TodayUsageData,
    items: LogResponseData["items"],
  ) => {
    const pageData = aggregateUsageData(items)
    accumulator.today_quota_consumption += pageData.today_quota_consumption
    accumulator.today_prompt_tokens += pageData.today_prompt_tokens
    accumulator.today_completion_tokens += pageData.today_completion_tokens
    accumulator.today_requests_count += items?.length || 0
    return accumulator
  }

  return await fetchPaginatedLogs(
    request,
    [LogType.Consume],
    usageAggregator,
    {
      ...EMPTY_TODAY_USAGE,
    },
    undefined,
    queryConfig,
  )
}

/**
 * Lightweight today-usage path.
 *
 * Uses the stat endpoint for exact quota only. Request counts and token totals
 * remain zero on this path because supported backends do not expose equivalent
 * lightweight day-total stat endpoints across variants.
 * @param request ApiServiceAccountRequest.
 * @param queryConfig Optional override for non-standard log pagination APIs.
 * @returns Fast today-usage snapshot.
 */
const fetchTodayUsageFast = async (
  request: ApiServiceAccountRequest,
  queryConfig?: TodayLogQueryConfig,
): Promise<TodayUsageData> => {
  const resolvedQueryConfig = resolveTodayLogQueryConfig(queryConfig)
  const statParams = buildTodayConsumeLogParams(undefined, resolvedQueryConfig)
  const statData = await fetchApiData<LogStatResponseData>(request, {
    endpoint: `/api/log/self/stat?${statParams.toString()}`,
  })

  return {
    ...EMPTY_TODAY_USAGE,
    today_quota_consumption:
      typeof statData?.quota === "number" && Number.isFinite(statData.quota)
        ? statData.quota
        : 0,
  }
}

/**
 * Fetch default New API-family today's usage.
 *
 * Fast path:
 * - `/api/log/self/stat` for exact quota totals
 *
 * Token totals and request counts stay zero on the fast path because supported
 * backends do not expose equivalent day-total stat endpoints across variants.
 * If the lightweight path is unavailable, fall back to full log pagination.
 * @param request ApiServiceAccountRequest (uses `includeTodayCashflow` to gate expensive log fetches).
 * @param queryConfig Optional override for non-standard log pagination APIs.
 * @returns Usage totals for the current day.
 */
export async function fetchTodayUsage(
  request: ApiServiceAccountRequest,
  queryConfig?: TodayLogQueryConfig,
): Promise<TodayUsageData> {
  if (request.includeTodayCashflow === false) {
    return { ...EMPTY_TODAY_USAGE }
  }

  try {
    return await fetchTodayUsageFast(request, queryConfig)
  } catch (error) {
    logger.warn("今日消费快路径失败，回退到日志聚合", error)
    return await fetchTodayUsageFromLogs(request, queryConfig)
  }
}

/**
 * Fetch default New API-family today's income (recharge/system logs).
 * @param request ApiServiceAccountRequest (uses `includeTodayCashflow` to gate expensive log fetches).
 * @param queryConfig Optional override for non-standard log pagination APIs.
 * @returns Total income amount for today.
 */
export async function fetchTodayIncome(
  request: ApiServiceAccountRequest,
  queryConfig?: TodayLogQueryConfig,
): Promise<TodayIncomeData> {
  if (request.includeTodayCashflow === false) {
    return { today_income: 0 }
  }

  const exchangeRate =
    typeof request.exchangeRate === "number" &&
    Number.isFinite(request.exchangeRate)
      ? request.exchangeRate
      : UI_CONSTANTS.EXCHANGE_RATE.DEFAULT
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
      logger.warn("获取记录失败", { typeName, error })
    },
    queryConfig,
  )

  return { today_income: totalIncome }
}

export const resolveCheckInSiteStatus = (
  checkIn: CheckInConfig,
  canCheckIn: boolean | undefined,
) => {
  const didDetectCheckInStatus =
    checkIn?.enableDetection === true && typeof canCheckIn === "boolean"

  if (!didDetectCheckInStatus) {
    return {
      ...(checkIn.siteStatus ?? {}),
      isCheckedInToday: checkIn.siteStatus?.isCheckedInToday,
      lastDetectedAt: checkIn.siteStatus?.lastDetectedAt,
    }
  }

  return {
    ...(checkIn.siteStatus ?? {}),
    isCheckedInToday: !canCheckIn,
    lastDetectedAt: Date.now(),
  }
}

/**
 * Fetch the default New API-family account snapshot.
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
      siteStatus: resolveCheckInSiteStatus(resolvedCheckIn, canCheckIn),
    },
  }
}

export const defaultAccountDataImplementation: AccountDataImplementation = {
  fetchAccountData,
}
