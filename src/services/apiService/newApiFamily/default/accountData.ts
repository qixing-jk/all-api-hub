import { UI_CONSTANTS } from "~/constants/ui"
import type {
  AccountData,
  ApiServiceAccountRequest,
  TodayIncomeDataWithAvailability,
  TodayUsageData,
  TodayUsageDataWithAvailability,
} from "~/services/accounts/accountDataModel"
import type { NewApiCheckInStatus } from "~/services/apiService/newApiFamily/checkInDto"
import {
  aggregateIncomeData,
  aggregateUsageData,
  getTodayTimestampRange,
  type AggregatedIncomeData,
  type AggregatedUsageData,
  type MetricAggregationCoverage,
  type TodayTimestampRange,
} from "~/services/apiService/newApiFamily/default/accountDataUtils"
import { REQUEST_CONFIG } from "~/services/apiTransport/constant"
import { ApiError } from "~/services/apiTransport/errors"
import { fetchApiData } from "~/services/apiTransport/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { LogType } from "~/services/history/usageHistory/usageLogModel"
import type {
  LogStatResponseData,
  TodayLogQueryConfig,
} from "~/services/history/usageHistory/usageLogModel"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  ACCOUNT_TODAY_METRIC_STATUSES,
  type AccountTodayMetricAvailability,
  type CheckInConfig,
} from "~/types"
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

interface PaginatedCollectionResult<T> {
  value: T
  successfulSourceCount: number
  failedSourceCount: number
  invalidSourceCount: number
  contributedPageCount: number
  pageLimitReached: boolean
}

const completeAvailability = (): AccountTodayMetricAvailability => ({
  status: ACCOUNT_TODAY_METRIC_STATUSES.Complete,
})

const unavailableAvailability = (
  reason: AccountTodayMetricAvailability["reason"],
): AccountTodayMetricAvailability => ({
  status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
  reason,
})

const partialAvailability = (
  reason: AccountTodayMetricAvailability["reason"],
): AccountTodayMetricAvailability => ({
  status: ACCOUNT_TODAY_METRIC_STATUSES.Partial,
  reason,
})

const classifyPaginatedCollection = <T>(
  result: PaginatedCollectionResult<T>,
): AccountTodayMetricAvailability => {
  if (result.pageLimitReached) {
    return partialAvailability(ACCOUNT_TODAY_METRIC_REASONS.PageLimit)
  }

  if (result.invalidSourceCount > 0) {
    return result.successfulSourceCount > 0 || result.contributedPageCount > 0
      ? partialAvailability(ACCOUNT_TODAY_METRIC_REASONS.SourcePartial)
      : unavailableAvailability(ACCOUNT_TODAY_METRIC_REASONS.InvalidPayload)
  }

  if (result.failedSourceCount > 0) {
    return result.successfulSourceCount > 0 || result.contributedPageCount > 0
      ? partialAvailability(ACCOUNT_TODAY_METRIC_REASONS.SourcePartial)
      : unavailableAvailability(ACCOUNT_TODAY_METRIC_REASONS.RequestFailed)
  }

  return completeAvailability()
}

interface MetricCollectionCoverage extends MetricAggregationCoverage {
  completeSourceCount: number
}

const classifyMetricCollection = <T>(
  result: PaginatedCollectionResult<T>,
  coverage: MetricCollectionCoverage,
): AccountTodayMetricAvailability => {
  const collectionAvailability = classifyPaginatedCollection(result)
  if (coverage.invalidCount === 0) return collectionAvailability

  const hasValidCoverage =
    coverage.validCount > 0 || coverage.completeSourceCount > 0
  if (!hasValidCoverage) {
    return unavailableAvailability(ACCOUNT_TODAY_METRIC_REASONS.InvalidPayload)
  }

  return collectionAvailability.status === ACCOUNT_TODAY_METRIC_STATUSES.Partial
    ? collectionAvailability
    : partialAvailability(ACCOUNT_TODAY_METRIC_REASONS.SourcePartial)
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
 * @param timestampRange Frozen day boundary shared by the account snapshot.
 * @param params Optional pagination overrides.
 * @param params.page Page number override.
 * @param params.pageSize Page size override.
 * @param config Optional endpoint/query customization for backend variants.
 */
const buildTodayLogQueryParams = (
  logType: LogType,
  timestampRange: TodayTimestampRange,
  params?: {
    page?: number
    pageSize?: number
  },
  config?: TodayLogQueryConfig,
) => {
  const { start: startTimestamp, end: endTimestamp } = timestampRange
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
 * @param timestampRange Frozen day boundary shared by the account snapshot.
 * @param errorHandler Optional handler per log type error.
 * @param queryConfig Optional override for non-standard log pagination APIs.
 * @returns Aggregated value plus source, page, failure, invalid-payload, and page-limit metadata.
 */
const fetchPaginatedLogs = async <T>(
  request: ApiServiceRequest,
  logTypes: LogType[],
  dataAggregator: (
    accumulator: T,
    items: readonly unknown[],
    logType: LogType,
  ) => T,
  initialValue: T,
  timestampRange: TodayTimestampRange,
  errorHandler?: (error: unknown, logType: LogType) => void,
  queryConfig?: TodayLogQueryConfig,
): Promise<PaginatedCollectionResult<T>> => {
  let aggregatedData = initialValue
  let successfulSourceCount = 0
  let failedSourceCount = 0
  let invalidSourceCount = 0
  let contributedPageCount = 0
  let pageLimitReached = false
  const resolvedQueryConfig = resolveTodayLogQueryConfig(queryConfig)

  const normalizeLogResponse = (
    payload: unknown,
  ):
    | {
        valid: true
        items: unknown[]
        total: number | null
      }
    | { valid: false } => {
    if (Array.isArray(payload)) {
      return {
        valid: true,
        items: payload,
        total: null,
      }
    }

    if (payload === null || typeof payload !== "object") {
      return { valid: false }
    }

    const payloadRecord = payload as Record<string, unknown>
    const itemsValue = payloadRecord[resolvedQueryConfig.itemsField]
    const totalValue = payloadRecord[resolvedQueryConfig.totalField]

    if (
      !Array.isArray(itemsValue) ||
      typeof totalValue !== "number" ||
      !Number.isFinite(totalValue) ||
      totalValue < 0
    ) {
      return { valid: false }
    }

    return {
      valid: true,
      items: itemsValue,
      total: totalValue,
    }
  }

  for (const logType of logTypes) {
    try {
      let currentPage = 1
      while (currentPage <= REQUEST_CONFIG.MAX_PAGES) {
        const params = buildTodayLogQueryParams(
          logType,
          timestampRange,
          {
            page: currentPage,
            pageSize: REQUEST_CONFIG.DEFAULT_PAGE_SIZE,
          },
          resolvedQueryConfig,
        )

        const logData = await fetchApiData<unknown>(request, {
          endpoint: `${resolvedQueryConfig.endpoint}?${params.toString()}`,
        })

        const normalizedLogData = normalizeLogResponse(logData)
        if (!normalizedLogData.valid) {
          invalidSourceCount += 1
          logger.warn("日志响应结构无效", {
            logType,
            page: currentPage,
            itemsField: resolvedQueryConfig.itemsField,
            totalField: resolvedQueryConfig.totalField,
          })
          break
        }

        const items = normalizedLogData.items
        contributedPageCount += 1
        aggregatedData = dataAggregator(aggregatedData, items, logType)

        const totalPages =
          normalizedLogData.total === null
            ? 1
            : Math.ceil(
                normalizedLogData.total / REQUEST_CONFIG.DEFAULT_PAGE_SIZE,
              )
        if (currentPage >= totalPages) {
          successfulSourceCount += 1
          break
        }
        if (currentPage === REQUEST_CONFIG.MAX_PAGES) {
          pageLimitReached = true
          successfulSourceCount += 1
          break
        }
        currentPage += 1
      }
    } catch (error) {
      failedSourceCount += 1
      if (errorHandler) {
        errorHandler(error, logType)
      } else {
        logger.warn("获取日志类型失败", { logType, error })
      }
    }
  }

  if (pageLimitReached) {
    logger.warn("达到最大分页限制，数据可能不完整", {
      maxPages: REQUEST_CONFIG.MAX_PAGES,
    })
  }

  return {
    value: aggregatedData,
    successfulSourceCount,
    failedSourceCount,
    invalidSourceCount,
    contributedPageCount,
    pageLimitReached,
  }
}

/**
 * Build "today consume logs" query params using the optional backend override.
 * @param timestampRange Frozen day boundary shared by the account snapshot.
 * @param params Optional pagination overrides.
 * @param params.page Page number override.
 * @param params.pageSize Page size override.
 * @param queryConfig Optional endpoint/query customization for backend variants.
 */
const buildTodayConsumeLogParams = (
  timestampRange: TodayTimestampRange,
  params?: {
    page?: number
    pageSize?: number
  },
  queryConfig?: TodayLogQueryConfig,
) =>
  buildTodayLogQueryParams(LogType.Consume, timestampRange, params, queryConfig)

/**
 * Legacy full aggregation path for today's usage metrics.
 * @param request ApiServiceAccountRequest.
 * @param timestampRange Frozen day boundary shared by the account snapshot.
 * @param queryConfig Optional override for non-standard log pagination APIs.
 * @returns Fully aggregated quota, token, and request totals.
 */
const fetchTodayUsageFromLogs = async (
  request: ApiServiceAccountRequest,
  timestampRange: TodayTimestampRange,
  queryConfig?: TodayLogQueryConfig,
): Promise<TodayUsageDataWithAvailability> => {
  const usageAggregator = (
    accumulator: AggregatedUsageData,
    items: readonly unknown[],
  ) => aggregateUsageData(items, accumulator)

  const result = await fetchPaginatedLogs(
    request,
    [LogType.Consume],
    usageAggregator,
    aggregateUsageData([]),
    timestampRange,
    undefined,
    queryConfig,
  )

  const consumptionCoverage = result.value.coverage.consumption
  const requestCoverage = result.value.coverage.rows
  const tokenCoverage = {
    validCount:
      result.value.coverage.promptTokens.validCount +
      result.value.coverage.completionTokens.validCount,
    invalidCount:
      result.value.coverage.promptTokens.invalidCount +
      result.value.coverage.completionTokens.invalidCount,
  }
  return {
    today_quota_consumption: result.value.today_quota_consumption,
    today_prompt_tokens: result.value.today_prompt_tokens,
    today_completion_tokens: result.value.today_completion_tokens,
    // This is validated consume-log row count, not a stronger backend request-total contract.
    today_requests_count: requestCoverage.validCount,
    todayStatsAvailability: {
      consumption: classifyMetricCollection(result, {
        ...consumptionCoverage,
        completeSourceCount:
          consumptionCoverage.invalidCount === 0
            ? result.successfulSourceCount
            : 0,
      }),
      requests: classifyMetricCollection(result, {
        ...requestCoverage,
        completeSourceCount:
          requestCoverage.invalidCount === 0 ? result.successfulSourceCount : 0,
      }),
      tokens: classifyMetricCollection(result, {
        ...tokenCoverage,
        completeSourceCount:
          tokenCoverage.invalidCount === 0 ? result.successfulSourceCount : 0,
      }),
    },
  }
}

/**
 * Lightweight today-usage path.
 *
 * Uses the stat endpoint for exact quota only. Request counts and token totals
 * remain zero on this path because supported backends do not expose equivalent
 * lightweight day-total stat endpoints across variants.
 * @param request ApiServiceAccountRequest.
 * @param timestampRange Frozen day boundary shared by the account snapshot.
 * @param queryConfig Optional override for non-standard log pagination APIs.
 * @returns Fast today-usage snapshot.
 */
const fetchTodayUsageFast = async (
  request: ApiServiceAccountRequest,
  timestampRange: TodayTimestampRange,
  queryConfig?: TodayLogQueryConfig,
): Promise<TodayUsageDataWithAvailability> => {
  const resolvedQueryConfig = resolveTodayLogQueryConfig(queryConfig)
  const statParams = buildTodayConsumeLogParams(
    timestampRange,
    undefined,
    resolvedQueryConfig,
  )
  const statData = await fetchApiData<LogStatResponseData>(request, {
    endpoint: `/api/log/self/stat?${statParams.toString()}`,
  })

  if (typeof statData?.quota !== "number" || !Number.isFinite(statData.quota)) {
    throw new Error("Today usage stat quota is missing or non-finite")
  }

  return {
    ...EMPTY_TODAY_USAGE,
    today_quota_consumption: statData.quota,
    todayStatsAvailability: {
      consumption: completeAvailability(),
      requests: unavailableAvailability(
        ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
      ),
      tokens: unavailableAvailability(ACCOUNT_TODAY_METRIC_REASONS.Unsupported),
    },
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
  timestampRange: TodayTimestampRange = getTodayTimestampRange(),
): Promise<TodayUsageDataWithAvailability> {
  if (request.includeTodayCashflow === false) {
    const notCollected = unavailableAvailability(
      ACCOUNT_TODAY_METRIC_REASONS.NotCollected,
    )
    return {
      ...EMPTY_TODAY_USAGE,
      todayStatsAvailability: {
        consumption: notCollected,
        requests: notCollected,
        tokens: notCollected,
      },
    }
  }

  try {
    return await fetchTodayUsageFast(request, timestampRange, queryConfig)
  } catch (error) {
    logger.warn("今日消费快路径失败，回退到日志聚合", error)
    return await fetchTodayUsageFromLogs(request, timestampRange, queryConfig)
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
  timestampRange: TodayTimestampRange = getTodayTimestampRange(),
): Promise<TodayIncomeDataWithAvailability> {
  if (request.includeTodayCashflow === false) {
    return {
      today_income: 0,
      todayStatsAvailability: {
        income: unavailableAvailability(
          ACCOUNT_TODAY_METRIC_REASONS.NotCollected,
        ),
      },
    }
  }

  const exchangeRate =
    typeof request.exchangeRate === "number" &&
    Number.isFinite(request.exchangeRate)
      ? request.exchangeRate
      : UI_CONSTANTS.EXCHANGE_RATE.DEFAULT
  const incomeCoverageBySource = new Map<LogType, MetricAggregationCoverage>()
  const incomeAggregator = (
    accumulator: AggregatedIncomeData,
    items: readonly unknown[],
    logType: LogType,
  ) => {
    const next = aggregateIncomeData(
      items,
      exchangeRate,
      UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR,
      accumulator,
    )
    const sourceCoverage = incomeCoverageBySource.get(logType) ?? {
      validCount: 0,
      invalidCount: 0,
    }
    sourceCoverage.validCount +=
      next.coverage.validCount - accumulator.coverage.validCount
    sourceCoverage.invalidCount +=
      next.coverage.invalidCount - accumulator.coverage.invalidCount
    incomeCoverageBySource.set(logType, sourceCoverage)
    return next
  }

  const result = await fetchPaginatedLogs(
    request,
    [LogType.Topup, LogType.System],
    incomeAggregator,
    aggregateIncomeData(
      [],
      exchangeRate,
      UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR,
    ),
    timestampRange,
    (error, logType) => {
      const typeName = logType === LogType.Topup ? "充值" : "签到"
      logger.warn("获取记录失败", { typeName, error })
    },
    queryConfig,
  )

  return {
    today_income: result.value.today_income,
    todayStatsAvailability: {
      income: classifyMetricCollection(result, {
        ...result.value.coverage,
        completeSourceCount: [...incomeCoverageBySource.values()].filter(
          ({ invalidCount }) => invalidCount === 0,
        ).length,
      }),
    },
  }
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
  const timestampRange = getTodayTimestampRange()

  const quotaPromise = fetchAccountQuota(request)
  const todayUsagePromise = fetchTodayUsage(request, undefined, timestampRange)
  const todayIncomePromise = fetchTodayIncome(
    request,
    undefined,
    timestampRange,
  )
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
    todayStatsAvailability: {
      ...todayUsage.todayStatsAvailability,
      ...todayIncome.todayStatsAvailability,
    },
    checkIn: {
      ...resolvedCheckIn,
      siteStatus: resolveCheckInSiteStatus(resolvedCheckIn, canCheckIn),
    },
  }
}

export const defaultAccountDataImplementation: AccountDataImplementation = {
  fetchAccountData,
}
