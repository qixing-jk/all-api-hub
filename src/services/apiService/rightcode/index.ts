import { ACCOUNT_USAGE_SCOPES } from "~/constants/accountUsage"
import { CURRENCIES } from "~/constants/money"
import type {
  AccountData,
  ApiServiceAccountRequest,
  RefreshAccountResult,
} from "~/services/accounts/accountDataModel"
import { determineHealthStatus } from "~/services/accounts/accountHealth"
import {
  accountAllowanceObservation,
  ALLOWANCE_IDENTITY_KINDS,
  parseAllowanceInstant,
  type AccountAllowanceEntry,
} from "~/services/accounts/allowances"
import {
  accountBalanceObservation,
  accountBalanceScope,
} from "~/services/accounts/balanceSnapshot"
import { balancePosition, observeAmount } from "~/services/amounts/balance"
import { budgetConstraint } from "~/services/amounts/budgets"
import {
  ASSET_KINDS,
  BALANCE_NATURES,
  BALANCE_VALIDITY_KINDS,
  BUDGET_LIMIT_STATES,
  BUDGET_PERIODS,
  BUDGET_WINDOW_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_ENUMERATION,
  SCOPE_SELECTION_KINDS,
  WALLET_BALANCE_COLLECTION_KEY,
} from "~/services/amounts/financialConstants"
import type {
  AccessTokenInfo,
  UserInfo,
} from "~/services/apiAdapters/contracts/accountBootstrap"
import {
  RIGHTCODE_ENDPOINTS,
  RIGHTCODE_INVITE_PATH,
} from "~/services/apiService/rightcode/constants"
import {
  amountToQuota,
  isRecord,
  isRightCodeEffectiveUpstreamPayload,
  isRightCodeKeyListPayload,
  isRightCodeOverallUsageStats,
  isRightCodeSubscriptionListPayload,
  isRightCodeSubscriptionSummary,
  isRightCodeUsageStats,
  isRightCodeUserInfo,
  toOptionalFiniteNumber,
  toOptionalString,
} from "~/services/apiService/rightcode/parsing"
import { resyncRightCodeAuthToken } from "~/services/apiService/rightcode/tokenResync"
import {
  fetchRightCodeData,
  isRightCodeAuthFailureError,
} from "~/services/apiService/rightcode/transport"
import type {
  RightCodeApiKey,
  RightCodeApiKeyCreateRequest,
  RightCodeApiKeyUpdateRequest,
  RightCodeEffectiveUpstream,
  RightCodeOverallUsageStats,
  RightCodeSubscription,
  RightCodeSubscriptionSummary,
  RightCodeUsageStats,
  RightCodeUserInfo,
} from "~/services/apiService/rightcode/type"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import {
  INVITE_LINK_FAILURE_REASONS,
  InviteLinkError,
} from "~/services/inviteLinks/errors"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  ACCOUNT_TODAY_METRIC_STATUSES,
  SiteHealthStatus,
  type AccountTodayMetricAvailability,
  type AccountTodayStatsAvailability,
  type AccountUsageSummary,
} from "~/types"
import { formatLocalDayKey } from "~/utils/core/dayKey"
import { createLogger } from "~/utils/core/logger"
import { joinUrl } from "~/utils/core/url"
import { t } from "~/utils/i18n/core"

const logger = createLogger("ApiService.RightCode")

const unavailableMetric = (
  reason:
    | typeof ACCOUNT_TODAY_METRIC_REASONS.Unsupported
    | typeof ACCOUNT_TODAY_METRIC_REASONS.NotCollected
    | typeof ACCOUNT_TODAY_METRIC_REASONS.RequestFailed,
): AccountTodayMetricAvailability => ({
  status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
  reason,
})

/** Right Code exposes no earnings/rebate income series for today. */
const UNSUPPORTED_INCOME: AccountTodayMetricAvailability = unavailableMetric(
  ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
)

const requireUserInfo = (payload: unknown): RightCodeUserInfo => {
  if (!isRightCodeUserInfo(payload)) {
    throw new Error("invalid_rightcode_user_info")
  }
  return payload
}

const requireKeyList = (payload: unknown): RightCodeApiKey[] => {
  if (!isRightCodeKeyListPayload(payload)) {
    throw new Error("invalid_rightcode_key_inventory")
  }
  return payload.keys
}

/**
 * Reads the signed-in account.
 *
 * A missing or expired bearer token answers 401 with `Missing userToken` /
 * `Invalid userToken`, which is what onboarding and account refresh key off.
 */
async function fetchRightCodeUserInfo(
  request: ApiServiceRequest,
): Promise<RightCodeUserInfo> {
  const payload = await fetchRightCodeData<unknown>(
    request,
    RIGHTCODE_ENDPOINTS.me,
  )
  return requireUserInfo(payload)
}

/** Today-only activity aggregate. The endpoint defaults to seven days. */
async function fetchRightCodeUsageStats(
  request: ApiServiceRequest,
  range: { startDate: string; endDate: string },
): Promise<RightCodeUsageStats> {
  const payload = await fetchRightCodeData<unknown>(
    request,
    RIGHTCODE_ENDPOINTS.usageStats,
    {
      query: { start_date: range.startDate, end_date: range.endDate },
    },
  )
  if (!isRightCodeUsageStats(payload)) {
    throw new Error("invalid_rightcode_usage_stats")
  }
  return payload
}

/** Lifetime activity aggregate (`统计范围为全部历史`). */
async function fetchRightCodeOverallUsageStats(
  request: ApiServiceRequest,
): Promise<RightCodeOverallUsageStats> {
  const payload = await fetchRightCodeData<unknown>(
    request,
    RIGHTCODE_ENDPOINTS.usageStatsOverall,
  )
  if (!isRightCodeOverallUsageStats(payload)) {
    throw new Error("invalid_rightcode_overall_usage_stats")
  }
  return payload
}

/**
 * Public site configuration. `public.balance.price` is the deployment's own
 * CNY price for one site dollar, i.e. the account's USD-to-CNY rate.
 */
export async function fetchRightCodePublicConfigs(
  request: ApiServiceRequest,
): Promise<Record<string, string>> {
  const payload = await fetchRightCodeData<unknown>(
    request,
    RIGHTCODE_ENDPOINTS.configs,
  )
  if (!isRecord(payload)) {
    throw new Error("invalid_rightcode_configs")
  }
  return payload as Record<string, string>
}

/** Subscribed quota pools for the account. */
async function fetchRightCodeSubscriptions(
  request: ApiServiceRequest,
): Promise<RightCodeSubscription[]> {
  const payload = await fetchRightCodeData<unknown>(
    request,
    RIGHTCODE_ENDPOINTS.subscriptions,
  )
  if (!isRightCodeSubscriptionListPayload(payload)) {
    throw new Error("invalid_rightcode_subscriptions")
  }
  return payload.subscriptions
}

/** Aggregated totals across the account's subscribed pools. */
async function fetchRightCodeSubscriptionSummary(
  request: ApiServiceRequest,
): Promise<RightCodeSubscriptionSummary> {
  const payload = await fetchRightCodeData<unknown>(
    request,
    RIGHTCODE_ENDPOINTS.subscriptionSummary,
  )
  if (!isRightCodeSubscriptionSummary(payload)) {
    throw new Error("invalid_rightcode_subscription_summary")
  }
  return payload
}

/**
 * Per-channel model catalog with the prices this account actually pays.
 * `effective_price_config` already includes the channel and account rates.
 */
export async function fetchRightCodeEffectiveUpstreams(
  request: ApiServiceRequest,
): Promise<RightCodeEffectiveUpstream[]> {
  const payload = await fetchRightCodeData<unknown>(
    request,
    RIGHTCODE_ENDPOINTS.modelPricing,
  )
  if (!isRightCodeEffectiveUpstreamPayload(payload)) {
    throw new Error("invalid_rightcode_model_pricing")
  }
  return payload.upstreams
}

/**
 * The key inventory. `key` is returned in plaintext by list, detail and create,
 * so a saved secret can always be re-read and exported.
 */
export async function fetchRightCodeKeys(
  request: ApiServiceRequest,
): Promise<RightCodeApiKey[]> {
  const payload = await fetchRightCodeData<unknown>(
    request,
    RIGHTCODE_ENDPOINTS.apiKeys,
  )
  return requireKeyList(payload)
}

/** One key by id; the deployment answers with the plaintext secret. */
export async function fetchRightCodeKey(
  request: ApiServiceRequest,
  id: number | string,
): Promise<RightCodeApiKey> {
  const payload = await fetchRightCodeData<unknown>(
    request,
    RIGHTCODE_ENDPOINTS.apiKeyDetail(id),
  )
  if (!isRecord(payload) || typeof payload.id !== "number") {
    throw new Error("invalid_rightcode_key_detail")
  }
  return payload as RightCodeApiKey
}

/** Creates a channel-bound key and returns it with its plaintext secret. */
export async function createRightCodeKey(
  request: ApiServiceRequest,
  body: RightCodeApiKeyCreateRequest,
): Promise<RightCodeApiKey> {
  const payload = await fetchRightCodeData<unknown>(
    request,
    RIGHTCODE_ENDPOINTS.apiKeyCreate,
    { method: "POST", body },
  )
  if (!isRecord(payload) || typeof payload.id !== "number") {
    throw new Error("invalid_rightcode_key_create")
  }
  return payload as RightCodeApiKey
}

/** Partial update; omitted fields keep their current value. */
export async function updateRightCodeKey(
  request: ApiServiceRequest,
  id: number | string,
  body: RightCodeApiKeyUpdateRequest,
): Promise<RightCodeApiKey | null> {
  const payload = await fetchRightCodeData<unknown>(
    request,
    RIGHTCODE_ENDPOINTS.apiKeyDetail(id),
    { method: "PATCH", body },
  )
  return isRecord(payload) && typeof payload.id === "number"
    ? (payload as RightCodeApiKey)
    : null
}

/**
 * Sets the key expiry. Accepts only `YYYY-MM-DDTHH:mm:ss` (no zone, no ms).
 * The deployment does not clear an existing expiry once set; null or empty
 * values leave the expiry unchanged.
 */
export async function setRightCodeKeyExpiry(
  request: ApiServiceRequest,
  id: number | string,
  expiredAt: string,
): Promise<void> {
  await fetchRightCodeData<unknown>(
    request,
    RIGHTCODE_ENDPOINTS.apiKeyExpire(id),
    {
      method: "PATCH",
      body: { expired_at: expiredAt },
    },
  )
}

/** Removes a key permanently. */
export async function deleteRightCodeKey(
  request: ApiServiceRequest,
  id: number | string,
): Promise<void> {
  await fetchRightCodeData<unknown>(
    request,
    RIGHTCODE_ENDPOINTS.apiKeyDetail(id),
    { method: "DELETE" },
  )
}

/**
 * Account snapshot used by the refresh flow: wallet balance, lifetime usage and
 * the subscribed quota pool.
 */
export async function fetchAccountData(
  request: ApiServiceAccountRequest,
): Promise<AccountData> {
  const shouldCollectToday = request.includeTodayCashflow !== false
  const today = formatLocalDayKey()

  const [{ value: userInfo, observedAt: walletObservedAt }, overallResult] =
    await Promise.all([
      fetchRightCodeUserInfo(request).then((value) => ({
        value,
        observedAt: Date.now(),
      })),
      fetchRightCodeOverallUsageStats(request)
        .then((value) => ({ value, observedAt: Date.now() }))
        .catch(() => ({ value: undefined, observedAt: Date.now() })),
    ])
  const overall = overallResult.value
  const scope = accountBalanceScope(request)
  const asset = { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD }
  const wallet = accountBalanceObservation(
    scope,
    [
      balancePosition({
        id: "balance",
        collectionKey: WALLET_BALANCE_COLLECTION_KEY,
        scope,
        asset,
        value: userInfo.balance,
        nature: BALANCE_NATURES.Prepaid,
        observedAt: walletObservedAt,
        source: {
          adapter: "rightcode",
          operation: RIGHTCODE_ENDPOINTS.me,
          contractVersion: "wallet-usd/v1",
          kind: EVIDENCE_KINDS.Reported,
          inputs: ["balance"],
        },
      }),
    ],
    walletObservedAt,
    FINANCIAL_ENUMERATION.Complete,
  )

  let todayStats: RightCodeUsageStats | null = null
  let todayObservedAt = walletObservedAt
  let todayFailed = false
  if (shouldCollectToday) {
    try {
      todayStats = await fetchRightCodeUsageStats(request, {
        startDate: today,
        endDate: today,
      })
      todayObservedAt = Date.now()
    } catch (error) {
      todayFailed = true
      logger.warn("Failed to fetch Right Code today usage", error)
    }
  }

  // Subscriptions are an optional product surface: a deployment may run without
  // any purchased plan, and a failure here must not hide the wallet balance.
  const [subscriptions, subscriptionSummary] = await Promise.all([
    fetchRightCodeSubscriptions(request).catch(() => null),
    fetchRightCodeSubscriptionSummary(request).catch(() => null),
  ])

  const todayCost = toOptionalFiniteNumber(todayStats?.total_cost)
  const todayRequests = toOptionalFiniteNumber(todayStats?.total_requests)
  const todayTokens = toOptionalFiniteNumber(todayStats?.total_tokens)
  const todayAvailability: AccountTodayMetricAvailability = todayFailed
    ? unavailableMetric(ACCOUNT_TODAY_METRIC_REASONS.RequestFailed)
    : unavailableMetric(ACCOUNT_TODAY_METRIC_REASONS.NotCollected)
  const collect = (
    value: number | undefined,
  ): AccountTodayMetricAvailability =>
    !shouldCollectToday
      ? unavailableMetric(ACCOUNT_TODAY_METRIC_REASONS.NotCollected)
      : value === undefined
        ? todayAvailability
        : {
            status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
            reason: ACCOUNT_TODAY_METRIC_REASONS.WrongPeriod,
          }

  const todayStatsAvailability = {
    consumption: collect(todayCost),
    requests: collect(todayRequests),
    tokens: collect(todayTokens),
    income: UNSUPPORTED_INCOME,
  } satisfies AccountTodayStatsAvailability

  const allowanceObservedAt = Date.now()
  // The official HomeUser subscription card prefixes total_quota and
  // remaining_quota directly with '$'. These are USD plan limits, separate
  // from the wallet; the New API atomic-quota ratio does not apply.
  const allowanceAsset = { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD }
  const planSource = {
    adapter: "rightcode",
    operation: RIGHTCODE_ENDPOINTS.subscriptions,
    contractVersion: "subscription-quota/v1",
    kind: EVIDENCE_KINDS.Reported,
  }
  const summarySource = {
    ...planSource,
    operation: RIGHTCODE_ENDPOINTS.subscriptionSummary,
  }
  let partialSubscriptions = false
  const seenPlans = new Set<string>()
  const entries: AccountAllowanceEntry[] = (subscriptions ?? []).flatMap(
    (plan) => {
      if (
        !isRecord(plan) ||
        !(
          (typeof plan.item_id === "number" &&
            Number.isSafeInteger(plan.item_id)) ||
          (typeof plan.item_id === "string" && plan.item_id.trim())
        )
      ) {
        partialSubscriptions = true
        return []
      }
      const planId = String(plan.item_id)
      if (seenPlans.has(planId)) {
        partialSubscriptions = true
        return []
      }
      seenPlans.add(planId)
      const at = parseAllowanceInstant(plan.expired_at)
      const base = {
        identityKind: "upstream" as const,
        collectionKey: "subscriptions",
        ...(typeof plan.name === "string" ? { label: plan.name } : {}),
        validity:
          at === undefined
            ? { kind: BALANCE_VALIDITY_KINDS.Unknown }
            : { kind: BALANCE_VALIDITY_KINDS.Expires, at },
        ...(typeof plan.expired_at === "string"
          ? { reportedTiming: { expiresAt: plan.expired_at } }
          : {}),
      }
      const constraint = (remaining: unknown, daily: boolean) =>
        budgetConstraint({
          asset: allowanceAsset,
          scope: {
            ...scope,
            ...(Array.isArray(plan.available_prefixes)
              ? {
                  routes: {
                    kind: SCOPE_SELECTION_KINDS.Restricted,
                    ids: plan.available_prefixes.filter(
                      (prefix) => typeof prefix === "string" && prefix.trim(),
                    ),
                  },
                }
              : {}),
          },
          source: planSource,
          observedAt: allowanceObservedAt,
          limitState: BUDGET_LIMIT_STATES.Finite,
          remaining,
          ...(daily ? {} : { limit: plan.total_quota }),
          window: daily
            ? { kind: BUDGET_WINDOW_KINDS.Unknown, period: BUDGET_PERIODS.Day }
            : { kind: BUDGET_WINDOW_KINDS.Unknown },
        })
      return [
        {
          ...base,
          id: `${plan.item_id}:total`,
          constraint: constraint(plan.remaining_quota, false),
        },
        ...(plan.available_today_quota === undefined ||
        plan.available_today_quota === null
          ? []
          : [
              {
                ...base,
                id: `${plan.item_id}:day`,
                constraint: constraint(plan.available_today_quota, true),
              },
            ]),
      ]
    },
  )
  const allowances = accountAllowanceObservation(
    scope,
    [
      {
        source: planSource,
        collectionKey: "subscriptions",
        enumeration:
          subscriptions === null
            ? FINANCIAL_ENUMERATION.Unavailable
            : partialSubscriptions
              ? FINANCIAL_ENUMERATION.Partial
              : FINANCIAL_ENUMERATION.Complete,
        entries,
      },
      {
        source: summarySource,
        collectionKey: "subscription-summary",
        enumeration:
          subscriptionSummary === null
            ? FINANCIAL_ENUMERATION.Unavailable
            : FINANCIAL_ENUMERATION.Complete,
        entries:
          subscriptionSummary === null
            ? []
            : [
                {
                  id: "summary",
                  identityKind: ALLOWANCE_IDENTITY_KINDS.SourceSlot,
                  collectionKey: "subscription-summary",
                  validity: { kind: BALANCE_VALIDITY_KINDS.Unknown },
                  constraint: budgetConstraint({
                    asset: allowanceAsset,
                    scope,
                    source: summarySource,
                    observedAt: allowanceObservedAt,
                    limitState: BUDGET_LIMIT_STATES.Finite,
                    limit: subscriptionSummary.total_quota,
                    used: subscriptionSummary.used_quota,
                    remaining: subscriptionSummary.remaining_quota,
                  }),
                },
              ],
      },
    ],
    allowanceObservedAt,
  )
  const usage: AccountUsageSummary = {
    scope: ACCOUNT_USAGE_SCOPES.Lifetime,
    totalRequests: toOptionalFiniteNumber(overall?.total_requests),
    totalTokens: toOptionalFiniteNumber(overall?.total_tokens),
    cost: {
      asset,
      scope,
      amount: observeAmount(
        overall?.total_cost,
        {
          adapter: "rightcode",
          operation: RIGHTCODE_ENDPOINTS.usageStatsOverall,
          contractVersion: "lifetime-usd/v1",
          kind: EVIDENCE_KINDS.Reported,
          inputs: ["total_cost"],
        },
        overallResult.observedAt,
      ),
    },
  }

  return {
    ...wallet,
    ...allowances,
    today_quota_consumption:
      shouldCollectToday && todayCost !== undefined
        ? amountToQuota(todayCost)
        : 0,
    // Right Code reports a single token total per period, not a prompt/completion
    // split, so the whole figure is carried on the completion side.
    today_prompt_tokens: 0,
    today_completion_tokens:
      shouldCollectToday && todayTokens !== undefined ? todayTokens : 0,
    today_requests_count:
      shouldCollectToday && todayRequests !== undefined ? todayRequests : 0,
    today_income: 0,
    todayStatsAvailability,
    usage,
    usageObservations: [
      usage,
      ...(todayStats
        ? [
            {
              scope: "site_today" as const,
              reportedDay: today,
              totalRequests: todayRequests,
              totalTokens: todayTokens,
              cost: {
                asset,
                scope,
                amount: observeAmount(
                  todayStats.total_cost,
                  {
                    adapter: "rightcode",
                    operation: RIGHTCODE_ENDPOINTS.usageStats,
                    contractVersion: "queried-period-usd/v1",
                    kind: EVIDENCE_KINDS.Reported,
                    inputs: [
                      "total_cost",
                      `start_date=${today}`,
                      `end_date=${today}`,
                    ],
                  },
                  todayObservedAt,
                ),
              },
            },
          ]
        : []),
    ],
    checkIn: request.checkIn,
  }
}

const buildAuthUpdate = (resynced: {
  accessToken: string
  userId: string
  username?: string
}) => ({
  accessToken: resynced.accessToken,
  ...(resynced.userId ? { userId: resynced.userId } : {}),
  ...(resynced.username ? { username: resynced.username } : {}),
})

/**
 * Refreshes the account, recovering a rotated token from the browser session.
 *
 * Right Code expires the account token on its own schedule (`登录令牌轮换`),
 * and has no refresh-token contract. When the stored copy is rejected, the
 * token the browser is currently holding is the only valid replacement; it is
 * persisted only after it is proven to work, so a stale browser session can
 * never overwrite a working credential.
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
        message: t("account:healthStatus.normal"),
      },
    }
  } catch (error) {
    if (isRightCodeAuthFailureError(error)) {
      const expectedUserId =
        request.auth?.userId !== undefined && request.auth?.userId !== null
          ? String(request.auth.userId).trim()
          : ""

      const resynced = await resyncRightCodeAuthToken(
        request.baseUrl,
        expectedUserId || undefined,
        request.tempWindowRequestSource,
        request.protectionBypassExecution,
      ).catch((resyncError) => {
        logger.warn("Right Code token re-sync failed", resyncError)
        return null
      })

      const currentToken =
        typeof request.auth?.accessToken === "string"
          ? request.auth.accessToken.trim()
          : ""
      if (resynced && resynced.accessToken !== currentToken) {
        if (
          expectedUserId &&
          resynced.userId &&
          String(resynced.userId).trim() !== expectedUserId
        ) {
          logger.warn(
            "Right Code token re-sync returned session for different user",
            {
              expected: expectedUserId,
              actual: resynced.userId,
            },
          )
          return { success: false, healthStatus: determineHealthStatus(error) }
        }

        try {
          const retryRequest: ApiServiceAccountRequest = {
            ...request,
            auth: { ...request.auth, accessToken: resynced.accessToken },
          }
          const retryUser = await fetchRightCodeUserInfo(retryRequest)
          if (
            expectedUserId &&
            String(retryUser.id).trim() !== expectedUserId
          ) {
            logger.warn(
              "Right Code token re-sync authenticated a different user",
              {
                expected: expectedUserId,
                actual: retryUser.id,
              },
            )
            return {
              success: false,
              healthStatus: determineHealthStatus(error),
            }
          }

          const data = await fetchAccountData(retryRequest)
          return {
            success: true,
            data,
            authUpdate: buildAuthUpdate(resynced),
            healthStatus: {
              status: SiteHealthStatus.Healthy,
              message: t("account:healthStatus.normal"),
            },
          }
        } catch (retryError) {
          logger.error("Right Code refresh failed after re-sync", retryError)
          return {
            success: false,
            healthStatus: determineHealthStatus(retryError),
          }
        }
      }
    }

    logger.error("Failed to refresh Right Code account data", error)
    return { success: false, healthStatus: determineHealthStatus(error) }
  }
}

/**
 * Onboarding identity. Right Code has no separate "create access token" step:
 * the account's own `user_token` is the bearer credential the API accepts, so
 * it doubles as the saved account token.
 */
export async function fetchUserInfo(
  request: ApiServiceRequest,
): Promise<UserInfo> {
  const user = await fetchRightCodeUserInfo(request)
  return {
    id: String(user.id),
    username: user.username,
    access_token: user.user_token,
  }
}

/** The account token is already the API credential, so this only re-reads it. */
export async function getOrCreateAccessToken(
  request: ApiServiceRequest,
): Promise<AccessTokenInfo> {
  const user = await fetchRightCodeUserInfo(request)
  return {
    username: user.username,
    access_token: user.user_token,
  }
}

/** Right Code runs no check-in flow at all. */
export async function fetchSupportCheckIn(): Promise<boolean> {
  return false
}

/**
 * The console builds invite links from the live origin, not a canonical
 * domain: `${origin}/register?aff=${invite_code}`.
 */
export async function fetchInviteLink(
  request: ApiServiceRequest,
): Promise<string> {
  const user = await fetchRightCodeUserInfo(request)
  const inviteCode = toOptionalString(user.invite_code)
  if (!inviteCode) {
    throw new InviteLinkError(
      INVITE_LINK_FAILURE_REASONS.InviteDataMissing,
      "rightcode invite code missing",
    )
  }

  return joinUrl(
    request.baseUrl,
    `${RIGHTCODE_INVITE_PATH}?aff=${encodeURIComponent(inviteCode)}`,
  )
}
