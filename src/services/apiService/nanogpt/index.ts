import { QUOTA_PER_USD } from "~/constants/money"
import type {
  AccountData,
  ApiServiceAccountRequest,
} from "~/services/accounts/accountDataModel"
import { createUnsupportedTodayStatsAvailability } from "~/services/accounts/metrics/accountTodayStats"
import type { UserInfo } from "~/services/apiAdapters/contracts/accountBootstrap"
import { NANOGPT_ENDPOINTS } from "~/services/apiService/nanogpt/constants"
import { parseNanoGptCredentials } from "~/services/apiService/nanogpt/credentials"
import {
  fetchNanoGptManagementSubscription,
  verifyNanoGptManagementCredential,
} from "~/services/apiService/nanogpt/managementIdentity"
import {
  parseNanoGptBalance,
  parseNanoGptSubscription,
  parseNanoGptUsageAggregate,
  type NanoGptBalance,
  type NanoGptSubscriptionSnapshot,
  type NanoGptUsageAggregate,
} from "~/services/apiService/nanogpt/parsing"
import { fetchNanoGptData } from "~/services/apiService/nanogpt/transport"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import {
  AuthTypeEnum,
  ACCOUNT_SUBSCRIPTION_STATUSES as subscriptionStatuses,
} from "~/types"
import type { AccountSubscriptionSummary } from "~/types"

/**
 * Reads the balances and the account identity that the saved API key proves.
 * The Nano deposit address is per-account and stable, so it is the identity a
 * bearer-only credential can be verified against (evidence/probe-01).
 */
export async function fetchNanoGptBalance(
  request: ApiServiceRequest,
): Promise<NanoGptBalance> {
  const body = await fetchNanoGptData<unknown>(
    request,
    NANOGPT_ENDPOINTS.checkBalance,
    { method: "POST", body: {} },
  )
  const balance = parseNanoGptBalance(body, NANOGPT_ENDPOINTS.checkBalance)
  const expectedIdentity = String(request.auth.userId ?? "").trim()
  if (expectedIdentity && expectedIdentity !== balance.depositAddress) {
    throw new ApiError(
      "NanoGPT account identity mismatch",
      undefined,
      NANOGPT_ENDPOINTS.checkBalance,
      API_ERROR_CODES.ACCOUNT_IDENTITY_MISMATCH,
    )
  }
  return balance
}

/** Verifies the saved key against the expected account identity. */
export async function fetchUserInfo(
  request: ApiServiceRequest,
): Promise<UserInfo> {
  if (request.auth.authType !== AuthTypeEnum.AccessToken) {
    // Only an inference key can read these endpoints; the console session is a
    // browser-context concern owned by the content-session extractor.
    throw new ApiError(
      "NanoGPT requires an inference API key",
      undefined,
      NANOGPT_ENDPOINTS.checkBalance,
      API_ERROR_CODES.FEATURE_UNSUPPORTED,
    )
  }
  const balance = await fetchNanoGptBalance(request)
  return {
    id: balance.depositAddress,
    // A key cannot reveal the console display name; completion fills it from
    // the browser session when one is available.
    username: "",
    access_token: null,
  }
}

/** Key-scoped aggregate usage over the provider's default 30 UTC-day window. */
export async function fetchNanoGptUsage(
  request: ApiServiceRequest,
): Promise<NanoGptUsageAggregate> {
  const body = await fetchNanoGptData<unknown>(request, NANOGPT_ENDPOINTS.usage)
  return parseNanoGptUsageAggregate(body, NANOGPT_ENDPOINTS.usage)
}

/** Subscription quotas; absent subscription data is omitted, never invented. */
export async function fetchNanoGptSubscription(
  request: ApiServiceRequest,
): Promise<NanoGptSubscriptionSnapshot> {
  const body = await fetchNanoGptData<unknown>(
    request,
    NANOGPT_ENDPOINTS.subscriptionUsage,
  )
  return parseNanoGptSubscription(body, NANOGPT_ENDPOINTS.subscriptionUsage)
}

/**
 * Maps documented token quotas into the shared subscription summary.
 * Input-token quotas count tokens, so only the token allowance is projected;
 * image quotas and the unverified plan metadata are intentionally left out.
 *
 * The daily and weekly quotas are independent and either may be unconfigured
 * (probe-20), so the daily window is preferred and the weekly one is the
 * fallback rather than being dropped.
 */
function toSubscriptionSummary(
  subscription: NanoGptSubscriptionSnapshot,
): AccountSubscriptionSummary | undefined {
  if (!subscription.active) {
    return {
      isActive: false,
      status:
        subscription.state === subscriptionStatuses.Grace
          ? subscriptionStatuses.Grace
          : subscriptionStatuses.Inactive,
    }
  }
  const daily = subscription.dailyInputTokens
  const window =
    daily?.remaining !== undefined
      ? { quota: daily, period: "day" }
      : subscription.weeklyInputTokens?.remaining !== undefined
        ? { quota: subscription.weeklyInputTokens, period: "week" }
        : undefined
  // `degraded` responses carry null counters: unknown is not a full allowance.
  if (!window) {
    return {
      isActive: true,
      status:
        subscription.state === subscriptionStatuses.Grace
          ? subscriptionStatuses.Grace
          : subscriptionStatuses.Active,
      billingType: "tokens",
    }
  }
  return {
    isActive: true,
    status:
      subscription.state === subscriptionStatuses.Grace
        ? subscriptionStatuses.Grace
        : subscriptionStatuses.Active,
    billingType: "tokens",
    remainingTokens: window.quota.remaining,
    period: window.period,
    ...(window.quota.resetAt ? { periodResetTime: window.quota.resetAt } : {}),
  }
}

/**
 * Reads cash balance plus the key's usage aggregate.
 *
 * Subscription quotas are read through the same credential but treated as
 * optional: the endpoint can answer `active: false`, and its failure must not
 * hide a valid balance. Only the balance (identity) and usage reads are
 * required.
 */
export async function fetchAccountData(
  request: ApiServiceAccountRequest,
): Promise<AccountData> {
  const pair = parseNanoGptCredentials(request.auth.accessToken)
  if (!pair.apiKey && pair.managementToken) {
    const snapshot = await verifyNanoGptManagementCredential(request)
    const subscription = snapshot
      ? toSubscriptionSummary(snapshot)
      : { status: subscriptionStatuses.Unavailable }
    return {
      quota: 0,
      balanceUnavailable: true,
      today_quota_consumption: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_requests_count: 0,
      today_income: 0,
      todayStatsAvailability: createUnsupportedTodayStatsAvailability(),
      ...(subscription ? { subscription } : {}),
      checkIn: request.checkIn,
    }
  }
  const [balance, usage] = await Promise.all([
    fetchNanoGptBalance(request),
    fetchNanoGptUsage(request),
  ])

  const subscription = await (
    pair.managementToken
      ? fetchNanoGptManagementSubscription(request).catch(() =>
          fetchNanoGptSubscription(request),
        )
      : fetchNanoGptSubscription(request)
  )
    .then(toSubscriptionSummary)
    .catch(() => ({ status: subscriptionStatuses.Unavailable }))

  return {
    quota: Math.round(balance.usdBalance * QUOTA_PER_USD),
    balanceUnavailable: false,
    ...(balance.nanoBalance !== undefined
      ? {
          nativeBalance: {
            unit: "USD_XNO" as const,
            total: balance.usdBalance,
            nanoBalance: balance.nanoBalance,
          },
        }
      : {}),
    today_quota_consumption: 0,
    today_prompt_tokens: 0,
    today_completion_tokens: 0,
    today_requests_count: 0,
    today_income: 0,
    // The usage contract is a key-scoped UTC window with no day boundary, so
    // per-day statistics stay explicitly unsupported.
    todayStatsAvailability: createUnsupportedTodayStatsAvailability(),
    usage: {
      scope: "rolling_window",
      totalRequests: usage.requests,
      totalTokens: usage.totalTokens,
      totalCost: usage.costUsd,
    },
    ...(subscription ? { subscription } : {}),
    checkIn: request.checkIn,
  }
}
