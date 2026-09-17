import { AIHUBMIX_API_ORIGIN } from "~/constants/siteType"
import type {
  AccountData,
  ApiServiceAccountRequest,
  RefreshAccountResult,
} from "~/services/accounts/accountDataModel"
import { determineHealthStatus } from "~/services/accounts/accountHealth"
import { normalizeAccountIdentity } from "~/services/accounts/accountIdentity"
import type {
  AccessTokenInfo,
  UserInfo,
} from "~/services/apiAdapters/contracts/accountBootstrap"
import { decodeAIHubMixResponseError } from "~/services/apiService/aihubmix/responseError"
import { fetchApiData } from "~/services/apiTransport/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import {
  INVITE_LINK_FAILURE_REASONS,
  InviteLinkError,
} from "~/services/inviteLinks/errors"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  ACCOUNT_TODAY_METRIC_STATUSES,
  AuthTypeEnum,
  SiteHealthStatus,
  type AccountTodayStatsAvailability,
} from "~/types"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

import type { AIHubMixKey, AIHubMixKeyData, AIHubMixKeyWrite } from "./keyTypes"
import { fetchAIHubMixData, normalizeAccessToken } from "./transport"

const logger = createLogger("ApiService.AIHubMix")
// AIHubMix console traffic is pinned to the main origin even when detection
// starts from console.aihubmix.com.
const AIHUBMIX_API_USER_SELF_ENDPOINT = "/api/user/self"
// These `/call/usr/*` routes are web-session endpoints used only while
// importing an account from the logged-in browser session.
const AIHUBMIX_USER_INFO_ENDPOINT = "/call/usr/self"
const AIHUBMIX_ACCESS_TOKEN_ENDPOINT = "/call/usr/tkn"

const createAIHubMixTodayStatsAvailability =
  (): AccountTodayStatsAvailability => ({
    consumption: {
      status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
      reason: ACCOUNT_TODAY_METRIC_REASONS.WrongPeriod,
    },
    requests: {
      status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
      reason: ACCOUNT_TODAY_METRIC_REASONS.WrongPeriod,
    },
    tokens: {
      status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
      reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
    },
    income: {
      status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
      reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
    },
  })

type AIHubMixUserInfo = {
  username: string
  display_name: string
  aff_code?: string | null
  access_token?: string | null
  quota?: number | string
  used_quota?: number | string
  request_count?: number | string
}

const toFiniteNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }
  return fallback
}

const createAIHubMixApiOriginRequest = (
  request: ApiServiceRequest,
): ApiServiceRequest => ({
  ...request,
  baseUrl: AIHUBMIX_API_ORIGIN,
  auth: {
    ...request.auth,
    authType: AuthTypeEnum.Cookie,
  },
})

const extractKeyItems = (payload: unknown): AIHubMixKeyData[] => {
  if (Array.isArray(payload)) return payload as AIHubMixKeyData[]
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>
    if (Array.isArray(record.items)) return record.items as AIHubMixKeyData[]
    if (Array.isArray(record.data)) return record.data as AIHubMixKeyData[]
  }
  return []
}

/**
 * Fetch the current AIHubMix user using the endpoint required by the active auth mode.
 * Cookie mode is only for import-time web-session reads; saved accounts use
 * AccessToken mode and `/api/user/self`.
 */
export async function fetchUserInfo(request: ApiServiceRequest): Promise<{
  id: string
  username: string
  access_token: string
  user: UserInfo
}> {
  const userData =
    request.auth?.authType === AuthTypeEnum.AccessToken
      ? await fetchAIHubMixData<AIHubMixUserInfo>(
          request,
          AIHUBMIX_API_USER_SELF_ENDPOINT,
          {
            cache: "no-store",
          },
        )
      : await fetchApiData<AIHubMixUserInfo>(
          createAIHubMixApiOriginRequest(request),
          {
            endpoint: AIHUBMIX_USER_INFO_ENDPOINT,
            options: {
              cache: "no-store",
            },
            errorResponseDecoder: decodeAIHubMixResponseError,
          },
        )

  const id = normalizeAccountIdentity(userData.username) ?? ""
  const username = normalizeAccountIdentity(userData.display_name) ?? ""
  const accessToken = normalizeAccessToken(userData.access_token)

  return {
    // AIHubMix intentionally omits database ids from web-session user info.
    // Upstream confirms username is unique and stable for third-party account ids:
    // https://github.com/jerlinn/inferHub/issues/2
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
 * Reveal the AIHubMix account access token using login cookies.
 */
export async function createAccessToken(
  request: ApiServiceRequest,
): Promise<string> {
  const searchParams = new URLSearchParams({
    _t: Date.now().toString(),
  })
  const token = await fetchApiData<string>(
    createAIHubMixApiOriginRequest(request),
    {
      endpoint: `${AIHUBMIX_ACCESS_TOKEN_ENDPOINT}?${searchParams.toString()}`,
      options: {
        cache: "no-store",
      },
      errorResponseDecoder: decodeAIHubMixResponseError,
    },
  )

  return normalizeAccessToken(token)
}

/**
 * Return the existing AIHubMix account access token or fetch it from the web console API.
 */
export async function getOrCreateAccessToken(
  request: ApiServiceRequest,
): Promise<AccessTokenInfo> {
  const userInfo = await fetchUserInfo(request)
  let accessToken = userInfo.access_token

  if (!accessToken) {
    accessToken = await createAccessToken(request)
  }

  return {
    username: userInfo.username,
    access_token: accessToken,
  }
}

/**
 * Report built-in check-in support for AIHubMix.
 */
export async function fetchSupportCheckIn(
  _request: ApiServiceRequest,
): Promise<boolean | undefined> {
  return false
}

/**
 * Fetch the current AIHubMix raw quota balance.
 */
export async function fetchAccountQuota(
  request: ApiServiceRequest,
): Promise<number> {
  const userInfo = await fetchAIHubMixData<AIHubMixUserInfo>(
    request,
    AIHUBMIX_API_USER_SELF_ENDPOINT,
  )
  return toFiniteNumber(userInfo.quota)
}

/**
 * Fetch the AIHubMix invitation code with the saved account access token.
 * The official current-user endpoint returns `aff_code`, and the deployed
 * console copies it as `https://aihubmix.com/?aff=<code>`.
 * https://docs.aihubmix.com/en/api/CliEndpoints/get-self
 */
export async function fetchInviteLink(
  request: ApiServiceRequest,
): Promise<string> {
  const userInfo = await fetchAIHubMixData<unknown>(
    request,
    AIHUBMIX_API_USER_SELF_ENDPOINT,
    { cache: "no-store" },
  )

  if (!userInfo || typeof userInfo !== "object" || Array.isArray(userInfo)) {
    throw new InviteLinkError(INVITE_LINK_FAILURE_REASONS.InviteDataMissing)
  }

  const inviteCodeValue = (userInfo as Partial<AIHubMixUserInfo>).aff_code
  const inviteCode =
    typeof inviteCodeValue === "string" ? inviteCodeValue.trim() : ""

  if (!inviteCode) {
    throw new InviteLinkError(INVITE_LINK_FAILURE_REASONS.InviteDataMissing)
  }

  const inviteUrl = new URL(AIHUBMIX_API_ORIGIN)
  inviteUrl.searchParams.set("aff", inviteCode)
  return inviteUrl.toString()
}

/**
 * Fetch the AIHubMix account balance snapshot.
 */
export async function fetchAccountData(
  request: ApiServiceAccountRequest,
): Promise<AccountData> {
  const userInfo = await fetchAIHubMixData<AIHubMixUserInfo>(
    request,
    AIHUBMIX_API_USER_SELF_ENDPOINT,
  )

  return {
    quota: toFiniteNumber(userInfo.quota),
    // AIHubMix client/API docs expose `used_quota` as cumulative account usage,
    // not a today total, so it must not populate today consumption.
    // Reference: https://docs.aihubmix.com/en/api/Cli
    today_quota_consumption: 0,
    today_prompt_tokens: 0,
    today_completion_tokens: 0,
    today_requests_count: 0,
    today_income: 0,
    todayStatsAvailability: createAIHubMixTodayStatsAvailability(),
    checkIn: request.checkIn,
  }
}

/**
 * Refresh AIHubMix account data and map failures to the shared health shape.
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
    logger.error("Failed to refresh AIHubMix account data", error)
    return {
      success: false,
      healthStatus: determineHealthStatus(error),
    }
  }
}

/**
 * Fetch and normalize AIHubMix API keys.
 */
export async function fetchAIHubMixKeys(
  request: ApiServiceRequest,
): Promise<AIHubMixKey[]> {
  const payload = await fetchAIHubMixData<unknown>(request, "/api/token/", {
    cache: "no-store",
  })
  if (
    !Array.isArray(payload) &&
    (!payload ||
      typeof payload !== "object" ||
      !(
        Array.isArray((payload as { items?: unknown }).items) ||
        Array.isArray((payload as { data?: unknown }).data)
      ))
  )
    throw new Error("invalid_aihubmix_key_inventory")
  const ids = new Set<number>()
  return extractKeyItems(payload).map((key) => {
    const normalized = requireAIHubMixKey(key)
    if (ids.has(normalized.id)) throw new Error("duplicate_aihubmix_key_id")
    ids.add(normalized.id)
    return normalized
  })
}

/** Validate the identity without inventing a key when an acknowledgement omits it. */
function requireAIHubMixKey(key: AIHubMixKeyData): AIHubMixKey {
  const id = Number(key?.id ?? key?.token_id)
  if (!Number.isSafeInteger(id) || id <= 0)
    throw new Error("invalid_aihubmix_key_id")
  return { ...key, id }
}

/** Read one provider-native key with its exact identity. */
export async function fetchAIHubMixKey(
  request: ApiServiceRequest,
  id: number,
): Promise<AIHubMixKey> {
  const key = requireAIHubMixKey(
    await fetchAIHubMixData<AIHubMixKeyData>(request, `/api/token/${id}`, {
      cache: "no-store",
    }),
  )
  if (key.id !== id) throw new Error("aihubmix_key_identity_mismatch")
  return key
}

/** Preserve response-only plaintext even when a create response omits its ID. */
export async function createAIHubMixKey(
  request: ApiServiceRequest,
  payload: AIHubMixKeyWrite,
): Promise<AIHubMixKeyData | undefined> {
  const created = await fetchAIHubMixData<unknown>(request, "/api/token/", {
    method: "POST",
    body: JSON.stringify(payload),
  })
  return created &&
    typeof created === "object" &&
    !Array.isArray(created) &&
    ["id", "token_id", "name", "key", "full_key", "token", "value"].some(
      (field) => field in created,
    )
    ? (created as AIHubMixKeyData)
    : undefined
}

/** Send only the documented native update payload to the canonical origin. */
export async function updateAIHubMixKey(
  request: ApiServiceRequest,
  id: number,
  payload: AIHubMixKeyWrite,
): Promise<void> {
  await fetchAIHubMixData(request, "/api/token/", {
    method: "PUT",
    body: JSON.stringify({ ...payload, id }),
  })
}

/**
 * Delete an AIHubMix API key.
 */
export async function deleteApiToken(
  request: ApiServiceRequest,
  tokenId: number,
): Promise<boolean> {
  await fetchAIHubMixData<unknown>(request, `/api/token/${tokenId}`, {
    method: "DELETE",
  })
  return true
}
