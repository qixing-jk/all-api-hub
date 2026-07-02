import { UI_CONSTANTS } from "~/constants/ui"
import type {
  AccountData,
  ApiServiceAccountRequest,
} from "~/services/accounts/accountDataModel"
import { fetchOpenAICompatibleModelIds } from "~/services/aiApi/openaiCompatible"
import type { UserInfo } from "~/services/apiAdapters/contracts/accountBootstrap"
import type { AccountServiceCredential } from "~/services/apiAdapters/contracts/serviceCredential"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { fetchApi } from "~/services/apiTransport/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { t } from "~/utils/i18n/core"

const SHAREDCHAT_GETME_ENDPOINT = "/frontend-api/getme"
const SHAREDCHAT_CODEX_QUOTA_ENDPOINT = "/frontend-api/vibe-code/quota"
const SHAREDCHAT_CODEX_RESET_KEY_ENDPOINT = "/frontend-api/vibe-code/reset-key"
const SHAREDCHAT_CODEX_BASE_URL = "https://new.sharedchat.cc/codex"

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

const toFiniteNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

const toOptionalFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
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
  const totalRequests = toFiniteNumber(currentUsage?.totalRequests)
  const totalTokens = toFiniteNumber(currentUsage?.totalTokens)
  const totalCost = toFiniteNumber(currentUsage?.totalCost)

  return {
    quota: amountToQuota(remainingAmount),
    today_quota_consumption: amountToQuota(totalCost),
    today_prompt_tokens: 0,
    today_completion_tokens: totalTokens,
    today_requests_count: totalRequests,
    today_income: 0,
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
 * Read the account-bound singleton Codex service key from the quota payload.
 */
export async function fetchCodexServiceCredential(
  request: ApiServiceRequest,
): Promise<AccountServiceCredential> {
  const codex = await getCodexQuota(request)
  const key = toOptionalString(codex.apiKey) ?? ""

  return {
    kind: "singleton_service_key",
    service: "codex",
    label: "Codex",
    key,
    isAuthenticated: codex.isAuth === true,
    baseUrl: SHAREDCHAT_CODEX_BASE_URL,
  }
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

  return {
    kind: "singleton_service_key",
    service: "codex",
    label: "Codex",
    key,
    isAuthenticated: true,
    baseUrl: SHAREDCHAT_CODEX_BASE_URL,
  }
}
