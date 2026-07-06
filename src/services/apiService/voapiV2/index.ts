import type {
  AccountData,
  ApiServiceAccountRequest,
  RefreshAccountResult,
} from "~/services/accounts/accountDataModel"
import { determineHealthStatus } from "~/services/accounts/accountHealth"
import type {
  CreateTokenRequest,
  UserGroupInfo,
} from "~/services/accountTokens/tokenProvisioningModel"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { fetchApi } from "~/services/apiTransport/request"
import {
  API_AUTH_TOKEN_MODES,
  type ApiServiceRequest,
} from "~/services/apiTransport/type"
import { SiteHealthStatus, type ApiToken, type CheckInConfig } from "~/types"
import { t } from "~/utils/i18n/core"

import {
  amountToQuota,
  isVoApiV2AuthExpiredError,
  parseVoApiV2Envelope,
  quotaToAmountString,
  type VoApiV2EnvelopeOptions,
} from "./parsing"
import { resyncVoApiV2AuthToken } from "./tokenResync"
import {
  VOAPI_V2_ENDPOINTS,
  VOAPI_V2_PROTOCOL_CODES,
  type VoApiV2CheckInStats,
  type VoApiV2CheckInSubmitData,
  type VoApiV2DashboardStatistics,
  type VoApiV2Envelope,
  type VoApiV2Key,
  type VoApiV2KeyTemplate,
  type VoApiV2UserInfo,
} from "./type"

const DEFAULT_KEYS_PAGE = 1
const DEFAULT_KEYS_PAGE_SIZE = 10
const TOKEN_LOOKUP_PAGE_SIZE = 100

type VoApiV2AccountDataRequest = ApiServiceRequest &
  Partial<Pick<ApiServiceAccountRequest, "checkIn" | "includeTodayCashflow">>

type VoApiV2CheckInSubmitResult =
  | VoApiV2CheckInSubmitData
  | { alreadySigned: true }

/**
 * Fetches a VoAPI v2 endpoint with the dashboard JWT sent as raw Authorization.
 */
async function fetchVoApiV2Data<TData>(
  request: ApiServiceRequest,
  endpoint: string,
  options: RequestInit = {},
  parseOptions?: VoApiV2EnvelopeOptions,
): Promise<TData> {
  const body = await fetchApi<unknown>(
    request,
    {
      endpoint,
      options,
      authTokenMode: API_AUTH_TOKEN_MODES.Raw,
    },
    true,
  )

  return parseVoApiV2Envelope<TData>(body, endpoint, parseOptions)
}

const buildTodayStatisticsEndpoint = () => {
  const start = new Date()
  start.setHours(0, 0, 0, 0)

  const end = new Date()
  end.setHours(23, 59, 59, 999)

  return `${VOAPI_V2_ENDPOINTS.DashboardStatistics}?t=h&s=${start.getTime()}&e=${end.getTime()}`
}

const toFiniteInteger = (value: unknown, fallback = 0): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value)
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback
  }

  return fallback
}

const toExpireTimeMillis = (expiredTime: number | undefined): number =>
  typeof expiredTime === "number" && expiredTime > 0 ? expiredTime * 1000 : -1

const toVoApiV2GroupId = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value)
  }
  if (typeof value !== "string" || !value.trim()) return undefined

  const parsed = Number(value.trim())
  return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined
}

const toExpiredTimeSeconds = (expireTime: unknown): number => {
  const value = toFiniteInteger(expireTime, -1)
  if (value <= 0) return -1

  return value > 1_000_000_000_000 ? Math.floor(value / 1000) : value
}

const toVoApiV2GroupMapKey = (value: unknown): string => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value))
  }
  if (typeof value === "string") return value.trim()
  return ""
}

const buildVoApiV2GroupNameById = (
  template: VoApiV2KeyTemplate,
): Map<string, string> => {
  return new Map(
    (template.groups ?? []).flatMap((group) => {
      const id = toVoApiV2GroupMapKey(group.id)
      const name = typeof group.name === "string" ? group.name.trim() : ""
      if (!id || !name) return []
      return [[id, name]]
    }),
  )
}

const resolveVoApiV2TokenGroup = (
  groups: VoApiV2Key["groups"],
  groupNameById: ReadonlyMap<string, string>,
): string => {
  const groupId = toVoApiV2GroupMapKey(groups?.[0])
  if (!groupId) return ""

  return groupNameById.get(groupId) ?? groupId
}

const buildKeysEndpoint = (
  page = DEFAULT_KEYS_PAGE,
  size = DEFAULT_KEYS_PAGE_SIZE,
) =>
  `${VOAPI_V2_ENDPOINTS.Keys}?page=${page}&size=${size}&sl[name]=true&sl[token]=true&sl[note]=true`

const normalizeVoApiV2Token = (
  token: VoApiV2Key,
  defaultUserId: unknown,
  groupNameById: ReadonlyMap<string, string> = new Map(),
): ApiToken => ({
  id: toFiniteInteger(token.id),
  user_id: toFiniteInteger(defaultUserId),
  key: typeof token.tokenMasked === "string" ? token.tokenMasked : "",
  status: token.enable === false ? 2 : 1,
  name: typeof token.name === "string" ? token.name : "",
  note: token.note,
  created_time: 0,
  accessed_time: 0,
  expired_time: toExpiredTimeSeconds(token.expireTime),
  remain_quota: amountToQuota(token.amount),
  unlimited_quota: token.boundlessAmount === true,
  model_limits_enabled: false,
  model_limits: "",
  allow_ips: "",
  used_quota: amountToQuota(token.used),
  group: resolveVoApiV2TokenGroup(token.groups, groupNameById),
  DeletedAt: null,
  models: "",
})

type VoApiV2KeyListPayload =
  | VoApiV2Key[]
  | {
      list?: VoApiV2Key[]
      records?: VoApiV2Key[]
    }

const extractKeyList = (payload: VoApiV2KeyListPayload) =>
  Array.isArray(payload) ? payload : payload.records ?? payload.list ?? []

const fetchVoApiV2RawKeys = async (
  request: ApiServiceRequest,
  page = DEFAULT_KEYS_PAGE,
  size = DEFAULT_KEYS_PAGE_SIZE,
) =>
  extractKeyList(
    await fetchVoApiV2Data<VoApiV2KeyListPayload>(
      request,
      buildKeysEndpoint(page, size),
      { cache: "no-store" },
    ),
  )

const fetchVoApiV2GroupNameById = async (
  request: ApiServiceRequest,
): Promise<Map<string, string>> => {
  try {
    return buildVoApiV2GroupNameById(await fetchVoApiV2Template(request))
  } catch {
    return new Map()
  }
}

const normalizeVoApiV2GroupSelector = (value: unknown): string =>
  typeof value === "string" ? value.trim() : ""

const resolveVoApiV2GroupIds = async (
  request: ApiServiceRequest,
  selectedGroup: unknown,
  fallbackGroups: Array<string | number> = [],
): Promise<number[]> => {
  const normalizedGroup = normalizeVoApiV2GroupSelector(selectedGroup)
  if (!normalizedGroup) {
    return fallbackGroups
      .map((group) => toVoApiV2GroupId(group))
      .filter((group): group is number => typeof group === "number")
  }

  const template = await fetchVoApiV2Template(request)
  const selectedLower = normalizedGroup.toLowerCase()
  const matchedGroup = (template.groups ?? []).find((group) => {
    const id = String(group.id).trim()
    const name = typeof group.name === "string" ? group.name.trim() : ""
    return id === normalizedGroup || name.toLowerCase() === selectedLower
  })
  const groupId = toVoApiV2GroupId(matchedGroup?.id ?? normalizedGroup)

  if (typeof groupId !== "number") {
    throw new ApiError(
      "VoAPI v2 group not found",
      undefined,
      VOAPI_V2_ENDPOINTS.KeyTemplate,
      API_ERROR_CODES.BUSINESS_ERROR,
    )
  }

  return [groupId]
}

const createVoApiV2TokenPayload = (
  tokenData: CreateTokenRequest,
  groups: number[],
  existing?: Pick<
    VoApiV2Key,
    "enable" | "groups" | "boundlessAmount" | "used" | "note"
  >,
) => ({
  name: tokenData.name,
  groups,
  amount: quotaToAmountString(tokenData.remain_quota),
  boundlessAmount: tokenData.unlimited_quota === true,
  enable: existing?.enable ?? true,
  expireTime: toExpireTimeMillis(tokenData.expired_time),
  ...(existing
    ? {
        used: existing.used ?? "0",
        note: existing.note ?? "",
      }
    : {
        genCount: 1,
      }),
})

/**
 * Fetches the authenticated VoAPI v2 account profile.
 */
export const fetchVoApiV2UserInfo = (request: ApiServiceRequest) =>
  fetchVoApiV2Data<VoApiV2UserInfo>(request, VOAPI_V2_ENDPOINTS.UserInfo, {
    cache: "no-store",
  })

/**
 * Reports check-in support for VoAPI v2 accounts.
 */
export const fetchSupportCheckIn = async (
  _request: ApiServiceRequest,
): Promise<boolean | undefined> => true

const fetchVoApiV2CheckedInToday = async (
  request: ApiServiceRequest,
): Promise<boolean | undefined> => {
  try {
    const stats = await fetchVoApiV2CheckInStats(request)
    return typeof stats.todaySigned === "boolean"
      ? stats.todaySigned
      : undefined
  } catch {
    return undefined
  }
}

const resolveVoApiV2CheckInSiteStatus = (
  checkIn: CheckInConfig,
  isCheckedInToday: boolean | undefined,
) => {
  if (typeof isCheckedInToday !== "boolean") {
    return {
      ...(checkIn.siteStatus ?? {}),
      isCheckedInToday: checkIn.siteStatus?.isCheckedInToday,
      lastDetectedAt: checkIn.siteStatus?.lastDetectedAt,
    }
  }

  return {
    ...(checkIn.siteStatus ?? {}),
    isCheckedInToday,
    lastDetectedAt: Date.now(),
  }
}

/**
 * Maps VoAPI v2 balances and current-day statistics into account dashboard data.
 */
export async function fetchVoApiV2AccountData(
  request: VoApiV2AccountDataRequest,
): Promise<AccountData> {
  const resolvedCheckIn = request.checkIn ?? { enableDetection: false }
  const userInfoPromise = fetchVoApiV2UserInfo(request)
  const statsPromise =
    request.includeTodayCashflow !== false
      ? fetchVoApiV2Data<VoApiV2DashboardStatistics>(
          request,
          buildTodayStatisticsEndpoint(),
          { cache: "no-store" },
        ).catch(() => null)
      : Promise.resolve<VoApiV2DashboardStatistics | null>(null)
  const checkedInTodayPromise = resolvedCheckIn.enableDetection
    ? fetchVoApiV2CheckedInToday(request)
    : Promise.resolve<boolean | undefined>(undefined)

  const [userInfo, stats, isCheckedInToday] = await Promise.all([
    userInfoPromise,
    statsPromise,
    checkedInTodayPromise,
  ])

  const quota =
    amountToQuota(userInfo.basicBalance) + amountToQuota(userInfo.bindBalance)
  const todayUsage =
    amountToQuota(stats?.d?.usedBasicBalance) +
    amountToQuota(stats?.d?.usedBindBalance)

  return {
    quota,
    today_quota_consumption: todayUsage,
    today_requests_count: Number(stats?.d?.requests ?? 0),
    today_prompt_tokens: 0,
    today_completion_tokens: 0,
    today_income: 0,
    checkIn: {
      ...resolvedCheckIn,
      siteStatus: resolveVoApiV2CheckInSiteStatus(
        resolvedCheckIn,
        isCheckedInToday,
      ),
    },
  }
}

/**
 * Refreshes VoAPI v2 account data with a site-specific expired-session status.
 */
export async function refreshAccountData(
  request: ApiServiceAccountRequest,
): Promise<RefreshAccountResult> {
  try {
    const data = await fetchVoApiV2AccountData(request)
    return {
      success: true,
      data,
      healthStatus: {
        status: SiteHealthStatus.Healthy,
        message: t("account:healthStatus.normal"),
      },
    }
  } catch (error) {
    if (isVoApiV2AuthExpiredError(error)) {
      const resynced = await resyncVoApiV2AuthToken(request.baseUrl)
      if (resynced) {
        const resyncedRequest: ApiServiceAccountRequest = {
          ...request,
          auth: {
            ...request.auth,
            accessToken: resynced.accessToken,
            userId: resynced.userId,
          },
        }

        try {
          const data = await fetchVoApiV2AccountData(resyncedRequest)
          return {
            success: true,
            data,
            authUpdate: {
              accessToken: resynced.accessToken,
              userId: resynced.userId,
              ...(resynced.username ? { username: resynced.username } : {}),
            },
            healthStatus: {
              status: SiteHealthStatus.Healthy,
              message: t("account:healthStatus.normal"),
            },
          }
        } catch (retryError) {
          if (isVoApiV2AuthExpiredError(retryError)) {
            return {
              success: false,
              healthStatus: {
                status: SiteHealthStatus.Warning,
                message: t("account:healthStatus.httpError", {
                  statusCode: 401,
                  message: retryError.message,
                }),
              },
            }
          }

          return {
            success: false,
            healthStatus: determineHealthStatus(retryError),
          }
        }
      }

      return {
        success: false,
        healthStatus: {
          status: SiteHealthStatus.Warning,
          message: t("account:healthStatus.httpError", {
            statusCode: 401,
            message: error.message,
          }),
        },
      }
    }

    return {
      success: false,
      healthStatus: determineHealthStatus(error),
    }
  }
}

/**
 * Lists VoAPI v2 API keys and normalizes them into the shared ApiToken shape.
 */
export async function fetchVoApiV2Tokens(
  request: ApiServiceRequest,
  page = DEFAULT_KEYS_PAGE,
  size = DEFAULT_KEYS_PAGE_SIZE,
): Promise<ApiToken[]> {
  const [keys, groupNameById] = await Promise.all([
    fetchVoApiV2RawKeys(request, page, size),
    fetchVoApiV2GroupNameById(request),
  ])

  return keys.map((token) =>
    normalizeVoApiV2Token(token, request.auth.userId, groupNameById),
  )
}

/**
 * Fetches VoAPI v2 key creation metadata, including groups and model ids.
 */
const fetchVoApiV2Template = (request: ApiServiceRequest) =>
  fetchVoApiV2Data<VoApiV2KeyTemplate>(
    request,
    VOAPI_V2_ENDPOINTS.KeyTemplate,
    { cache: "no-store" },
  )

/**
 * Finds one VoAPI v2 key by id from the key inventory.
 */
async function fetchVoApiV2TokenById(
  request: ApiServiceRequest,
  tokenId: number,
): Promise<VoApiV2Key> {
  let page = DEFAULT_KEYS_PAGE

  while (true) {
    const keys = await fetchVoApiV2RawKeys(
      request,
      page,
      TOKEN_LOOKUP_PAGE_SIZE,
    )
    const token = keys.find((item) => item.id === tokenId)

    if (token) {
      return token
    }

    if (keys.length < TOKEN_LOOKUP_PAGE_SIZE) {
      break
    }

    page += 1
  }

  throw new ApiError(
    "VoAPI v2 token not found",
    undefined,
    VOAPI_V2_ENDPOINTS.Keys,
    API_ERROR_CODES.BUSINESS_ERROR,
  )
}

type VoApiV2RevealTokenResponse = string | { token?: unknown }

const extractVoApiV2RevealedToken = (
  value: VoApiV2RevealTokenResponse,
): string => {
  if (typeof value === "string") return value
  if (value && typeof value === "object" && typeof value.token === "string") {
    return value.token
  }

  throw new ApiError(
    "VoAPI v2 token reveal response is missing token",
    undefined,
    VOAPI_V2_ENDPOINTS.Keys,
    API_ERROR_CODES.JSON_PARSE_ERROR,
  )
}

/**
 * Reveals the full secret for a VoAPI v2 key without falling back to common routes.
 */
export async function resolveVoApiV2TokenKey(
  request: ApiServiceRequest,
  token: Pick<ApiToken, "id" | "key">,
): Promise<string> {
  const revealedToken = await fetchVoApiV2Data<VoApiV2RevealTokenResponse>(
    request,
    `${VOAPI_V2_ENDPOINTS.Keys}/${token.id}/token`,
    { method: "POST" },
    { allowTopLevelToken: true },
  )

  return extractVoApiV2RevealedToken(revealedToken)
}

/**
 * Creates a VoAPI v2 key and relies on inventory refetch for the created secret.
 */
export async function createVoApiV2Token(
  request: ApiServiceRequest,
  tokenData: CreateTokenRequest,
): Promise<boolean> {
  const groups = await resolveVoApiV2GroupIds(request, tokenData.group)

  await fetchVoApiV2Data<null>(
    request,
    VOAPI_V2_ENDPOINTS.Keys,
    {
      method: "POST",
      body: JSON.stringify(createVoApiV2TokenPayload(tokenData, groups)),
    },
    { allowNullData: true },
  )

  return true
}

/**
 * Updates a VoAPI v2 key through the backend's `/api/keys/{id}` endpoint.
 */
export async function updateVoApiV2Token(
  request: ApiServiceRequest,
  tokenId: number,
  tokenData: CreateTokenRequest,
): Promise<boolean> {
  const existing = await fetchVoApiV2TokenById(request, tokenId)
  const groups = await resolveVoApiV2GroupIds(
    request,
    tokenData.group,
    existing.groups,
  )

  await fetchVoApiV2Data<null>(
    request,
    `${VOAPI_V2_ENDPOINTS.Keys}/${tokenId}`,
    {
      method: "PUT",
      body: JSON.stringify({
        id: tokenId,
        ...createVoApiV2TokenPayload(tokenData, groups, existing),
      }),
    },
    { allowNullData: true },
  )

  return true
}

/**
 * Enables or disables a VoAPI v2 key through the standard update endpoint.
 */
export async function setVoApiV2TokenEnabled(
  request: ApiServiceRequest,
  tokenId: number,
  enable: boolean,
): Promise<boolean> {
  const existing = await fetchVoApiV2TokenById(request, tokenId)

  await fetchVoApiV2Data<null>(
    request,
    `${VOAPI_V2_ENDPOINTS.Keys}/${tokenId}`,
    {
      method: "PUT",
      body: JSON.stringify({
        id: tokenId,
        name: existing.name ?? "",
        groups: await resolveVoApiV2GroupIds(request, "", existing.groups),
        enable,
        expireTime: existing.expireTime ?? -1,
        boundlessAmount: existing.boundlessAmount === true,
        amount: existing.amount ?? "0",
        used: existing.used ?? "0",
        note: existing.note ?? "",
      }),
    },
    { allowNullData: true },
  )

  return true
}

/**
 * Deletes a VoAPI v2 key.
 */
export async function deleteVoApiV2Token(
  request: ApiServiceRequest,
  tokenId: number,
): Promise<boolean> {
  await fetchVoApiV2Data<null>(
    request,
    `${VOAPI_V2_ENDPOINTS.Keys}/${tokenId}`,
    { method: "DELETE" },
    { allowNullData: true },
  )

  return true
}

/**
 * Fetches VoAPI v2 check-in stats for final status confirmation.
 */
export const fetchVoApiV2CheckInStats = (request: ApiServiceRequest) =>
  fetchVoApiV2Data<VoApiV2CheckInStats>(
    request,
    VOAPI_V2_ENDPOINTS.CheckInStats,
    { cache: "no-store" },
  )

/**
 * Submits the VoAPI v2 API check-in and classifies same-day repeats.
 */
export async function submitVoApiV2CheckIn(
  request: ApiServiceRequest,
): Promise<VoApiV2CheckInSubmitResult> {
  const body = await fetchApi<VoApiV2Envelope<VoApiV2CheckInSubmitData>>(
    request,
    {
      endpoint: VOAPI_V2_ENDPOINTS.CheckInSubmit,
      options: { method: "POST" },
      authTokenMode: API_AUTH_TOKEN_MODES.Raw,
    },
    true,
  )

  if (
    body &&
    typeof body === "object" &&
    body.code === VOAPI_V2_PROTOCOL_CODES.AlreadySigned &&
    /signed|check/i.test(body.msg ?? body.message ?? "")
  ) {
    return { alreadySigned: true }
  }

  return parseVoApiV2Envelope<VoApiV2CheckInSubmitData>(
    body,
    VOAPI_V2_ENDPOINTS.CheckInSubmit,
  )
}

/**
 * Returns enabled, visible VoAPI v2 model ids from the key template.
 */
export async function fetchVoApiV2AvailableModels(
  request: ApiServiceRequest,
): Promise<string[]> {
  const template = await fetchVoApiV2Template(request)
  const models = template.models ?? []

  return Array.from(
    new Set(
      models
        .filter((model) => model.enable !== false && model.hidden !== true)
        .map((model) => (typeof model.idKey === "string" ? model.idKey : ""))
        .map((model) => model.trim())
        .filter(Boolean),
    ),
  )
}

/**
 * Maps VoAPI v2 group template data into the shared user-group inventory.
 */
export async function fetchVoApiV2UserGroups(
  request: ApiServiceRequest,
): Promise<Record<string, UserGroupInfo>> {
  const template = await fetchVoApiV2Template(request)

  return (template.groups ?? []).reduce<Record<string, UserGroupInfo>>(
    (groups, group) => {
      const id = String(group.id).trim()
      if (!id) return groups

      const name = typeof group.name === "string" ? group.name.trim() : ""
      const note = typeof group.note === "string" ? group.note.trim() : ""
      groups[id] = {
        desc: note || name,
        ratio:
          typeof group.ratio === "number" && Number.isFinite(group.ratio)
            ? group.ratio
            : 1,
      }

      return groups
    },
    {},
  )
}
