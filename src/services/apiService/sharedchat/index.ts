import { UI_CONSTANTS } from "~/constants/ui"
import type {
  AccountData,
  ApiServiceAccountRequest,
} from "~/services/accounts/accountDataModel"
import { SHAREDCHAT_WEB_ORIGIN } from "~/services/accountSiteDefinitions/identifiers"
import { fetchOpenAICompatibleModelIds } from "~/services/aiApi/openaiCompatible"
import type { UserInfo } from "~/services/apiAdapters/contracts/accountBootstrap"
import type { AccountServiceCredential } from "~/services/apiAdapters/contracts/serviceCredential"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { fetchApi } from "~/services/apiTransport/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import {
  INVITE_LINK_FAILURE_REASONS,
  InviteLinkError,
} from "~/services/inviteLinks/errors"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  ACCOUNT_TODAY_METRIC_STATUSES,
  type AccountTodayMetricAvailability,
} from "~/types"
import { toOptionalFiniteNumber } from "~/utils/core/number"
import { t } from "~/utils/i18n/core"

import {
  SHAREDCHAT_CODEX_BASE_URL,
  SHAREDCHAT_CODEX_INVITE_OVERVIEW_ENDPOINT,
  SHAREDCHAT_CODEX_QUOTA_ENDPOINT,
  SHAREDCHAT_CODEX_RESET_KEY_ENDPOINT,
  SHAREDCHAT_GETME_ENDPOINT,
} from "./constants"

type SharedChatEnvelope<T> = {
  code?: unknown
  msg?: unknown
  data?: T
}

type SharedChatUserPayload = {
  id?: unknown
  name?: unknown
  email?: unknown
  userToken?: unknown
}

type SharedChatCodexSubscriptionPayload = {
  subTypeName?: unknown
  billingType?: unknown
  limit?: unknown
  amountLimit?: unknown
  usedAmount?: unknown
  remainingAmount?: unknown
  usedCount?: unknown
  remainingCount?: unknown
  period?: unknown
  periodResetTime?: unknown
  expireTime?: unknown
  isLongTerm?: unknown
  isActive?: unknown
}

type SharedChatCodexUsagePayload = {
  totalRequests?: unknown
  totalTokens?: unknown
  totalCost?: unknown
  lastRequestTime?: unknown
}

type SharedChatCodexRecentRecordPayload = {
  requestTime?: unknown
  model?: unknown
  inputTokens?: unknown
  outputTokens?: unknown
  cacheCreationTokens?: unknown
  cacheReadTokens?: unknown
  cacheInputTokens?: unknown
  reasoningTokens?: unknown
  totalTokens?: unknown
  responseTime?: unknown
  firstByteTime?: unknown
  cost?: unknown
  errorMessage?: unknown
  status?: unknown
}

type SharedChatCodexQuotaPayload = {
  codex?: {
    isAuth?: unknown
    apiKey?: unknown
    subscriptions?: SharedChatCodexSubscriptionPayload
    currentUsage?: SharedChatCodexUsagePayload
    recentRecords?: SharedChatCodexRecentRecordPayload[]
  }
}

type SharedChatResetKeyPayload = {
  newKey?: unknown
}

type SharedChatInviteOverviewPayload = {
  inviteUrl?: unknown
}

const buildCodexServiceCredential = (params: {
  key: string
  isAuthenticated: boolean
}): AccountServiceCredential => ({
  kind: "singleton_service_key",
  service: "codex",
  label: "Codex",
  key: params.key,
  isAuthenticated: params.isAuthenticated,
  baseUrl: SHAREDCHAT_CODEX_BASE_URL,
})

const toFiniteNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

const toOptionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined

const toOptionalBoolean = (value: unknown): boolean | undefined =>
  typeof value === "boolean" ? value : undefined

// SharedChat's `/frontend-api/vibe-code/quota` returns USD amounts; AccountData
// balance and consumption fields are stored as internal quota points.
const amountToQuota = (amount: number): number =>
  Math.round(amount * UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR)

const extractSharedChatData = <T>(
  body: SharedChatEnvelope<T>,
  endpoint: string,
): T => {
  if (!body || typeof body !== "object") {
    throw new ApiError(
      t("messages:errors.api.invalidResponseFormat"),
      undefined,
      endpoint,
      API_ERROR_CODES.JSON_PARSE_ERROR,
    )
  }

  if (body.code !== 1) {
    throw new ApiError(
      toOptionalString(body.msg) ??
        t("messages:errors.api.invalidResponseFormat"),
      undefined,
      endpoint,
      API_ERROR_CODES.BUSINESS_ERROR,
    )
  }

  if (!("data" in body)) {
    throw new ApiError(
      t("messages:errors.api.invalidResponseFormat"),
      undefined,
      endpoint,
      API_ERROR_CODES.JSON_PARSE_ERROR,
    )
  }

  return body.data as T
}

const fetchSharedChatData = async <T>(
  request: ApiServiceRequest,
  endpoint: string,
  options: RequestInit = {},
): Promise<T> => {
  const body = await fetchApi<SharedChatEnvelope<T>>(
    request,
    {
      endpoint,
      options: {
        cache: "no-store",
        ...options,
      },
    },
    true,
  )
  return extractSharedChatData<T>(body, endpoint)
}

const getCodexQuota = async (
  request: ApiServiceRequest,
): Promise<NonNullable<SharedChatCodexQuotaPayload["codex"]>> => {
  const data = await fetchSharedChatData<SharedChatCodexQuotaPayload>(
    request,
    SHAREDCHAT_CODEX_QUOTA_ENDPOINT,
  )
  const codex = data?.codex

  if (!codex || typeof codex !== "object") {
    throw new ApiError(
      t("messages:errors.api.invalidResponseFormat"),
      undefined,
      SHAREDCHAT_CODEX_QUOTA_ENDPOINT,
    )
  }

  return codex
}

const mapRecentRecords = (
  records: SharedChatCodexRecentRecordPayload[] | undefined,
): NonNullable<AccountData["recentUsageRecords"]> | undefined => {
  if (!Array.isArray(records)) return undefined

  return records
    .filter((record) => record && typeof record === "object")
    .map((record) => ({
      requestTime: toOptionalString(record.requestTime),
      model: toOptionalString(record.model),
      inputTokens: toOptionalFiniteNumber(record.inputTokens),
      outputTokens: toOptionalFiniteNumber(record.outputTokens),
      cacheCreationTokens: toOptionalFiniteNumber(record.cacheCreationTokens),
      cacheReadTokens: toOptionalFiniteNumber(record.cacheReadTokens),
      cacheInputTokens: toOptionalFiniteNumber(record.cacheInputTokens),
      reasoningTokens: toOptionalFiniteNumber(record.reasoningTokens),
      totalTokens: toOptionalFiniteNumber(record.totalTokens),
      responseTime: toOptionalFiniteNumber(record.responseTime),
      firstByteTime: toOptionalFiniteNumber(record.firstByteTime),
      cost: toOptionalFiniteNumber(record.cost),
      errorMessage: toOptionalString(record.errorMessage) ?? "",
      status: toOptionalString(record.status),
    }))
}

/**
 * SharedChat exposes the Codex dashboard data through frontend-api routes:
 * `/frontend-api/vibe-code/quota` contains subscription, usage, recent records,
 * and the singleton Codex API key. It is not New API token inventory.
 */
export async function fetchAccountData(
  request: ApiServiceAccountRequest,
): Promise<AccountData> {
  const codex = await getCodexQuota(request)
  const subscription = codex.subscriptions
  const currentUsage = codex.currentUsage
  const remainingAmount = toFiniteNumber(subscription?.remainingAmount)
  const parsedTotalRequests = toOptionalFiniteNumber(
    currentUsage?.totalRequests,
  )
  const parsedTotalTokens = toOptionalFiniteNumber(currentUsage?.totalTokens)
  const parsedTotalCost = toOptionalFiniteNumber(currentUsage?.totalCost)
  const totalRequests = parsedTotalRequests ?? 0
  const totalTokens = parsedTotalTokens ?? 0
  const totalCost = parsedTotalCost ?? 0
  const invalidPayload: AccountTodayMetricAvailability = {
    status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
    reason: ACCOUNT_TODAY_METRIC_REASONS.InvalidPayload,
  }
  const complete: AccountTodayMetricAvailability = {
    status: ACCOUNT_TODAY_METRIC_STATUSES.Complete,
  }
  const notCollected: AccountTodayMetricAvailability = {
    status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
    reason: ACCOUNT_TODAY_METRIC_REASONS.NotCollected,
  }
  const shouldCollectToday = request.includeTodayCashflow !== false

  // The production dashboard labels currentUsage as “24-Hour Statistics”. Keep
  // its richer boundary explicit because it is a rolling window, not calendar today.
  const todayStatsAvailability = {
    consumption: shouldCollectToday
      ? parsedTotalCost === undefined
        ? invalidPayload
        : complete
      : notCollected,
    requests: shouldCollectToday
      ? parsedTotalRequests === undefined
        ? invalidPayload
        : complete
      : notCollected,
    tokens: shouldCollectToday
      ? parsedTotalTokens === undefined
        ? invalidPayload
        : {
            status: ACCOUNT_TODAY_METRIC_STATUSES.Partial,
            reason: ACCOUNT_TODAY_METRIC_REASONS.SourcePartial,
          }
      : notCollected,
    income: {
      status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
      reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
    },
  } satisfies NonNullable<AccountData["todayStatsAvailability"]>

  return {
    quota: amountToQuota(remainingAmount),
    today_quota_consumption: shouldCollectToday ? amountToQuota(totalCost) : 0,
    today_prompt_tokens: 0,
    today_completion_tokens: shouldCollectToday ? totalTokens : 0,
    today_requests_count: shouldCollectToday ? totalRequests : 0,
    today_income: 0,
    todayStatsAvailability,
    usage: {
      scope: "rolling_window",
      totalRequests,
      totalTokens,
      totalCost,
      lastRequestTime: toOptionalString(currentUsage?.lastRequestTime),
    },
    subscription: subscription
      ? {
          name: toOptionalString(subscription.subTypeName),
          billingType: toOptionalString(subscription.billingType),
          limit: toOptionalFiniteNumber(subscription.limit),
          amountLimit: toOptionalFiniteNumber(subscription.amountLimit),
          usedAmount: toOptionalFiniteNumber(subscription.usedAmount),
          remainingAmount: toOptionalFiniteNumber(subscription.remainingAmount),
          usedCount: toOptionalFiniteNumber(subscription.usedCount),
          remainingCount: toOptionalFiniteNumber(subscription.remainingCount),
          period: toOptionalString(subscription.period),
          periodResetTime: toOptionalString(subscription.periodResetTime),
          expireTime: toOptionalString(subscription.expireTime),
          isLongTerm: toOptionalBoolean(subscription.isLongTerm),
          isActive: toOptionalBoolean(subscription.isActive),
        }
      : undefined,
    recentUsageRecords: mapRecentRecords(codex.recentRecords),
    checkIn: {
      ...(request.checkIn ?? { enableDetection: false }),
      enableDetection: false,
      siteStatus: {
        ...(request.checkIn?.siteStatus ?? {}),
        isCheckedInToday: undefined,
      },
    },
  }
}

/**
 * Fetch the logged-in SharedChat account identity from the frontend API.
 */
export async function fetchUserInfo(request: ApiServiceRequest): Promise<{
  id: string
  username: string
  access_token: string
  user: UserInfo
}> {
  const userData = await fetchSharedChatData<SharedChatUserPayload>(
    request,
    SHAREDCHAT_GETME_ENDPOINT,
  )
  const id = toOptionalString(userData.id) ?? ""
  const username =
    toOptionalString(userData.name) ?? toOptionalString(userData.email) ?? id
  const accessToken = toOptionalString(userData.userToken) ?? ""

  return {
    id,
    username,
    access_token: accessToken,
    user: {
      ...userData,
      id,
      username,
      access_token: accessToken,
    },
  }
}

/**
 * Fetch the invite URL supplied by SharedChat's authenticated Codex dashboard.
 * The deployed UI consumes `data.inviteUrl` from this endpoint and pins its
 * path, query, and hash to the current SharedChat origin.
 * https://new.sharedchat.cc/frontend-api/vibe-code/codex/invite/overview?page=1&pageSize=1
 */
export async function fetchInviteLink(
  request: ApiServiceRequest,
): Promise<string> {
  const data = await fetchSharedChatData<SharedChatInviteOverviewPayload>(
    request,
    SHAREDCHAT_CODEX_INVITE_OVERVIEW_ENDPOINT,
  )
  const inviteUrl = toOptionalString(data?.inviteUrl)

  if (!inviteUrl) {
    throw new InviteLinkError(INVITE_LINK_FAILURE_REASONS.InviteDataMissing)
  }

  let sourceUrl: URL
  try {
    sourceUrl = new URL(inviteUrl, SHAREDCHAT_WEB_ORIGIN)
  } catch (error) {
    throw new InviteLinkError(
      INVITE_LINK_FAILURE_REASONS.InvalidResponse,
      error,
    )
  }
  const targetUrl = new URL(SHAREDCHAT_WEB_ORIGIN)
  targetUrl.pathname = sourceUrl.pathname
  targetUrl.search = sourceUrl.search
  targetUrl.hash = sourceUrl.hash
  return targetUrl.toString()
}

/**
 * Read the account-bound singleton Codex service key from the quota payload.
 */
export async function fetchCodexServiceCredential(
  request: ApiServiceRequest,
): Promise<AccountServiceCredential> {
  const codex = await getCodexQuota(request)
  const key = toOptionalString(codex.apiKey) ?? ""

  return buildCodexServiceCredential({
    key,
    isAuthenticated: codex.isAuth === true && Boolean(key),
  })
}

/**
 * Fetch the Codex runtime model catalog through the account-bound service key.
 */
export async function fetchCodexServiceModels(
  request: ApiServiceRequest & {
    auth: ApiServiceRequest["auth"] & { apiKey: string }
  },
): Promise<string[]> {
  return fetchOpenAICompatibleModelIds({
    baseUrl: SHAREDCHAT_CODEX_BASE_URL,
    apiKey: request.auth.apiKey,
    abortSignal: request.abortSignal,
  })
}

/**
 * Rotate the account-bound singleton Codex service key.
 */
export async function rotateCodexServiceCredential(
  request: ApiServiceRequest,
): Promise<AccountServiceCredential> {
  const data = await fetchSharedChatData<SharedChatResetKeyPayload>(
    request,
    SHAREDCHAT_CODEX_RESET_KEY_ENDPOINT,
    {
      method: "POST",
      body: JSON.stringify({ subtype: "codex" }),
    },
  )
  const key = toOptionalString(data?.newKey) ?? ""

  return buildCodexServiceCredential({
    key,
    isAuthenticated: true,
  })
}
