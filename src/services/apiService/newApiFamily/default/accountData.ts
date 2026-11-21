import { ACCOUNT_CREDENTIAL_RECOVERY_OPERATIONS } from "~/constants/accountLogin"
import {
  CURRENCIES,
  DEFAULT_USD_TO_CNY_RATE,
  QUOTA_PER_USD,
} from "~/constants/money"
import type {
  AccountData,
  ApiServiceAccountRequest,
  TodayIncomeDataWithAvailability,
  TodayUsageData,
  TodayUsageDataWithAvailability,
} from "~/services/accounts/accountDataModel"
import {
  accountBalanceObservation,
  accountBalanceScope,
  accountReportingScope as createAccountReportingScope,
} from "~/services/accounts/balanceSnapshot"
import { balancePosition, observeAmount } from "~/services/amounts/balance"
import { parseDecimal, sumDecimals } from "~/services/amounts/decimal"
import {
  ASSET_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
  FINANCIAL_ENUMERATION,
  FINANCIAL_SETTLEMENT_STATUSES,
  INCOME_CLASSIFICATIONS,
  WALLET_BALANCE_COLLECTION_KEY,
} from "~/services/amounts/financialConstants"
import type { FinancialIncomeFact } from "~/services/amounts/income"
import { collectAccountData } from "~/services/apiService/newApiFamily/default/accountDataCollection"
import {
  aggregateIncomeData,
  aggregateUsageData,
  getTodayTimestampRange,
  matchIncomeLogAmount,
  type AggregatedIncomeData,
  type AggregatedUsageData,
  type MetricAggregationCoverage,
  type TodayTimestampRange,
} from "~/services/apiService/newApiFamily/default/accountDataUtils"
import { NEW_API_FINANCIAL_CONTRACT_VERSIONS } from "~/services/apiService/newApiFamily/financialContractVersions"
import { newApiFinancialAmount } from "~/services/apiService/newApiFamily/quotaAsset"
import { newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
import { REQUEST_CONFIG } from "~/services/apiTransport/constant"
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
} from "~/types"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("NewApiFamilyAccountData")
const NEW_API_FINANCIAL_ADAPTER = "new-api-family"

const EMPTY_TODAY_USAGE: TodayUsageData = {
  today_quota_consumption: 0,
  today_prompt_tokens: 0,
  today_completion_tokens: 0,
  today_requests_count: 0,
}

type NativeTodayUsage = TodayUsageDataWithAvailability &
  Pick<AccountData, "settledConsumption">

/** These self-log queries omit token/model/group filters; report coverage is independent of spending restrictions. */
function accountReportingScope(request: ApiServiceAccountRequest) {
  return createAccountReportingScope(
    request,
    request.auth.userId ? { walletId: `user:${request.auth.userId}` } : {},
  )
}

/** The query supplies its own day interval; native quota never acquires a USD denomination. */
function withNativeConsumption(
  request: ApiServiceAccountRequest,
  usage: TodayUsageDataWithAvailability,
  range: TodayTimestampRange,
  operation: string,
  value: unknown = usage.today_quota_consumption,
): NativeTodayUsage {
  const observedAt = Date.now()
  const metric = usage.todayStatsAvailability.consumption
  const nativeAmount = newApiFinancialAmount(
    value,
    request.baseUrl,
    request.siteType,
  )
  const source = {
    adapter: request.siteType ?? NEW_API_FINANCIAL_ADAPTER,
    operation,
    contractVersion: nativeAmount.contractVersion,
    kind: EVIDENCE_KINDS.Reported,
    amountInputs: nativeAmount.amountInputs,
  }
  const scope = accountReportingScope(request)
  return {
    ...usage,
    ...(metric.status === ACCOUNT_TODAY_METRIC_STATUSES.Unavailable
      ? {}
      : {
          settledConsumption: [
            {
              asset: nativeAmount.asset,
              amount: observeAmount(nativeAmount.value, source, observedAt),
              scope,
              window: {
                start: range.start * 1000,
                end: (range.end + 1) * 1000,
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              },
              settlement: FINANCIAL_SETTLEMENT_STATUSES.Settled,
              cumulative: true,
              coverage:
                metric.status === ACCOUNT_TODAY_METRIC_STATUSES.Complete
                  ? FINANCIAL_COVERAGE.Complete
                  : FINANCIAL_COVERAGE.Partial,
            },
          ],
        }),
    todayStatsAvailability: {
      ...usage.todayStatsAvailability,
      consumption:
        metric.status === ACCOUNT_TODAY_METRIC_STATUSES.Unavailable
          ? metric
          : unavailableAvailability(
              ACCOUNT_TODAY_METRIC_REASONS.LegacyUnclassified,
            ),
    },
  }
}

const DEFAULT_TODAY_LOG_QUERY_CONFIG: Required<
  Omit<TodayLogQueryConfig, "extraParams">
> & {
  extraParams: Record<string, string>
} = {
  endpoint: "/api/log/self",
  pageIndexOffset: 0,
  paginateArraysUntilEmpty: false,
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
 * @returns The raw native amount; missing and malformed values remain observable.
 */
export async function fetchAccountQuota(
  request: ApiServiceRequest,
): Promise<unknown> {
  const userData = await newApiFamilyRequests.data<{ quota?: unknown }>(
    request,
    {
      endpoint: "/api/user/self",
      credentialRecovery: ACCOUNT_CREDENTIAL_RECOVERY_OPERATIONS.Read,
    },
  )

  return userData?.quota
}

/** Observe the common default USD denomination; unknown deployments retain native quota. */
export async function fetchAccountBalance(request: ApiServiceAccountRequest) {
  const value = await fetchAccountQuota(request)
  const nativeAmount = newApiFinancialAmount(
    value,
    request.baseUrl,
    request.siteType,
  )
  const observedAt = Date.now()
  const scope = accountBalanceScope(request)
  const observation = accountBalanceObservation(
    scope,
    [
      balancePosition({
        id: "quota",
        collectionKey: WALLET_BALANCE_COLLECTION_KEY,
        scope,
        value: nativeAmount.value,
        observedAt,
        asset: nativeAmount.asset,
        source: {
          adapter: request.siteType ?? NEW_API_FINANCIAL_ADAPTER,
          operation: "/api/user/self:quota",
          contractVersion: nativeAmount.contractVersion,
          kind: EVIDENCE_KINDS.Reported,
          amountInputs: nativeAmount.amountInputs,
        },
      }),
    ],
    observedAt,
    FINANCIAL_ENUMERATION.Complete,
  )
  if (
    nativeAmount.contractVersion ===
      NEW_API_FINANCIAL_CONTRACT_VERSIONS.StandardUsd &&
    nativeAmount.value !== undefined
  ) {
    // Replace the preceding dev representation only after a usable observation.
    observation.balanceRefreshParts.push({
      collectionKey: WALLET_BALANCE_COLLECTION_KEY,
      source: {
        ...observation.balance.positions[0]!.amount.source,
        contractVersion: NEW_API_FINANCIAL_CONTRACT_VERSIONS.NativeQuota,
      },
      enumeration: FINANCIAL_ENUMERATION.Complete,
      positions: [],
    })
  }
  return observation
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
            page: currentPage + resolvedQueryConfig.pageIndexOffset,
            pageSize: REQUEST_CONFIG.DEFAULT_PAGE_SIZE,
          },
          resolvedQueryConfig,
        )

        const logData = await newApiFamilyRequests.data<unknown>(request, {
          endpoint: `${resolvedQueryConfig.endpoint}?${params.toString()}`,
          credentialRecovery: ACCOUNT_CREDENTIAL_RECOVERY_OPERATIONS.Read,
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
            ? resolvedQueryConfig.paginateArraysUntilEmpty && items.length > 0
              ? Infinity
              : 1
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
): Promise<NativeTodayUsage> => {
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
  const usage: TodayUsageDataWithAvailability = {
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
  return withNativeConsumption(
    request,
    usage,
    timestampRange,
    `${queryConfig?.endpoint ?? DEFAULT_TODAY_LOG_QUERY_CONFIG.endpoint}:consumption`,
    result.value.nativeQuotaConsumption ?? usage.today_quota_consumption,
  )
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
): Promise<NativeTodayUsage> => {
  const resolvedQueryConfig = resolveTodayLogQueryConfig(queryConfig)
  const statParams = buildTodayConsumeLogParams(
    timestampRange,
    undefined,
    resolvedQueryConfig,
  )
  const statData = await newApiFamilyRequests.data<LogStatResponseData>(
    request,
    {
      endpoint: `/api/log/self/stat?${statParams.toString()}`,
      credentialRecovery: ACCOUNT_CREDENTIAL_RECOVERY_OPERATIONS.Read,
    },
  )

  const quota = parseDecimal(statData?.quota)
  if (quota === undefined) {
    throw new Error("Today usage stat quota is missing or non-finite")
  }

  return withNativeConsumption(
    request,
    {
      ...EMPTY_TODAY_USAGE,
      today_quota_consumption: Number(quota),
      todayStatsAvailability: {
        consumption: completeAvailability(),
        requests: unavailableAvailability(
          ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
        ),
        tokens: unavailableAvailability(
          ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
        ),
      },
    },
    timestampRange,
    "/api/log/self/stat:quota",
    quota,
  )
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
): Promise<NativeTodayUsage> {
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
    return fetchTodayUsageFromLogs(request, timestampRange, queryConfig)
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
): Promise<
  TodayIncomeDataWithAvailability & Pick<AccountData, "reportedIncome">
> {
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
    Number.isFinite(request.exchangeRate) &&
    request.exchangeRate > 0
      ? request.exchangeRate
      : DEFAULT_USD_TO_CNY_RATE
  const incomeCoverageBySource = new Map<LogType, MetricAggregationCoverage>()
  const nativeIncomeValues: string[] = []
  const textIncomeValues = { USD: [] as string[], CNY: [] as string[] }
  let nativeIncomeInvalidCount = 0
  const incomeAggregator = (
    accumulator: AggregatedIncomeData,
    items: readonly unknown[],
    logType: LogType,
  ) => {
    for (const item of items) {
      const row =
        item && typeof item === "object" && !Array.isArray(item)
          ? (item as Record<string, unknown>)
          : undefined
      const quota = parseDecimal(row?.quota)
      const textAmount =
        (quota === undefined || quota === "0") &&
        typeof row?.content === "string"
          ? matchIncomeLogAmount(row.content)
          : null
      if (textAmount) {
        const symbol = textAmount.currencySymbol.normalize("NFKC")
        const currency =
          symbol === "$"
            ? CURRENCIES.USD
            : symbol === "¥"
              ? CURRENCIES.CNY
              : undefined
        const value = parseDecimal(textAmount.rawAmount)
        if (currency && value !== undefined)
          textIncomeValues[currency].push(value)
        else nativeIncomeInvalidCount += 1
      } else if (quota !== undefined) nativeIncomeValues.push(quota)
      else nativeIncomeInvalidCount += 1
    }
    const next = aggregateIncomeData(
      items,
      exchangeRate,
      QUOTA_PER_USD,
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
    aggregateIncomeData([], exchangeRate, QUOTA_PER_USD),
    timestampRange,
    (error, logType) => {
      const typeName = logType === LogType.Topup ? "充值" : "签到"
      logger.warn("获取记录失败", { typeName, error })
    },
    queryConfig,
  )

  const incomeAvailability = classifyMetricCollection(result, {
    ...result.value.coverage,
    completeSourceCount: [...incomeCoverageBySource.values()].filter(
      ({ invalidCount }) => invalidCount === 0,
    ).length,
  })
  const nativeCollection = classifyPaginatedCollection(result)
  const nativeComplete =
    nativeIncomeInvalidCount === 0 &&
    nativeCollection.status === ACCOUNT_TODAY_METRIC_STATUSES.Complete
  let nativeIncome: string | undefined
  try {
    nativeIncome =
      nativeIncomeValues.length ||
      (nativeComplete &&
        !textIncomeValues.USD.length &&
        !textIncomeValues.CNY.length)
        ? sumDecimals(nativeIncomeValues)
        : undefined
  } catch {
    nativeIncome = undefined
    nativeIncomeInvalidCount += 1
  }
  const observedAt = Date.now()
  const creditedAmount = newApiFinancialAmount(
    nativeIncome,
    request.baseUrl,
    request.siteType,
  )
  const quotaInUsd = creditedAmount.asset.kind === ASSET_KINDS.Currency
  const totals = ([CURRENCIES.USD, CURRENCIES.CNY] as const).map((code) => {
    const values = textIncomeValues[code]
    const quota =
      code === CURRENCIES.USD && quotaInUsd ? creditedAmount.value : undefined
    const inputs = [
      ...(quota === undefined ? [] : ["quota"]),
      ...(values.length ? ["content"] : []),
    ]
    return {
      asset: { kind: ASSET_KINDS.Currency, code },
      values: quota === undefined ? values : [quota, ...values],
      inputs,
      amountInputs:
        quota === undefined ? undefined : creditedAmount.amountInputs,
    }
  })
  const incomeAmounts = [
    ...totals,
    ...(quotaInUsd || creditedAmount.value === undefined
      ? []
      : [
          {
            asset: creditedAmount.asset,
            values: [creditedAmount.value],
            inputs: ["quota"],
            amountInputs: creditedAmount.amountInputs,
          },
        ]),
  ]
    .filter(({ values }) => values.length)
    .flatMap((total) => {
      try {
        return [{ ...total, value: sumDecimals(total.values) }]
      } catch {
        nativeIncomeInvalidCount += 1
        return []
      }
    })
  const coverage =
    nativeComplete && nativeIncomeInvalidCount === 0
      ? FINANCIAL_COVERAGE.Complete
      : FINANCIAL_COVERAGE.Partial
  return {
    reportedIncome: incomeAmounts.length
      ? incomeAmounts.map((total): FinancialIncomeFact => ({
          asset: total.asset,
          scope: accountReportingScope(request),
          amount: observeAmount(
            total.value,
            {
              adapter: request.siteType ?? NEW_API_FINANCIAL_ADAPTER,
              operation: `${queryConfig?.endpoint ?? DEFAULT_TODAY_LOG_QUERY_CONFIG.endpoint}:credited-quota`,
              contractVersion: creditedAmount.contractVersion,
              kind: EVIDENCE_KINDS.Derived,
              amountInputs: total.amountInputs,
              inputs: [
                `type=${LogType.Topup}`,
                `type=${LogType.System}`,
                ...total.inputs,
              ],
            },
            observedAt,
          ),
          window: {
            start: timestampRange.start * 1000,
            end: (timestampRange.end + 1) * 1000,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
          classification: INCOME_CLASSIFICATIONS.Unclassified,
          cumulative: true,
          coverage,
        }))
      : undefined,
    today_income: result.value.today_income,
    todayStatsAvailability: {
      income:
        incomeAvailability.status === ACCOUNT_TODAY_METRIC_STATUSES.Unavailable
          ? incomeAvailability
          : unavailableAvailability(
              ACCOUNT_TODAY_METRIC_REASONS.LegacyUnclassified,
            ),
    },
  }
}

/**
 * Fetch the default New API-family account snapshot.
 */
export async function fetchAccountData(
  request: ApiServiceAccountRequest,
  queryConfig?: TodayLogQueryConfig,
): Promise<AccountData> {
  return collectAccountData(request, {
    balance: () => fetchAccountBalance(request),
    usage: (range) => fetchTodayUsage(request, queryConfig, range),
    income: (range) => fetchTodayIncome(request, queryConfig, range),
  })
}

export const defaultAccountDataImplementation: AccountDataImplementation = {
  fetchAccountData,
}
