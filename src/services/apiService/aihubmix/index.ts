import { AIHUBMIX_API_ORIGIN, SITE_TYPES } from "~/constants/siteType"
import { UI_CONSTANTS } from "~/constants/ui"
import type {
  AccountData,
  ApiServiceAccountRequest,
  RefreshAccountResult,
  TodayIncomeData,
  TodayUsageData,
} from "~/services/accounts/accountDataModel"
import { determineHealthStatus } from "~/services/accounts/accountHealth"
import { normalizeAccountIdentity } from "~/services/accounts/accountIdentity"
import {
  hasUsableApiTokenKey,
  isMaskedApiTokenKey,
  normalizeApiTokenKey,
  normalizeApiTokenKeyValue,
} from "~/services/accountTokens/apiTokenKey"
import type {
  CreateTokenRequest,
  CreateTokenResult,
} from "~/services/accountTokens/tokenProvisioningModel"
import type {
  AccessTokenInfo,
  SiteStatusInfo,
  UserInfo,
} from "~/services/apiAdapters/contracts/accountBootstrap"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { fetchApiData } from "~/services/apiTransport/request"
import type {
  ApiResponse,
  ApiServiceRequest,
} from "~/services/apiTransport/type"
import {
  MODEL_LIST_SOURCE_KINDS,
  type ModelPricing,
  type PricingResponse,
} from "~/services/modelList/pricingModel"
import {
  MODEL_VENDOR_EVIDENCE_KINDS,
  normalizeModelDescriptors,
  type ModelVendorEvidence,
} from "~/services/models/modelDescriptor"
import { AuthTypeEnum, SiteHealthStatus, type ApiToken } from "~/types"
import { createLogger } from "~/utils/core/logger"
import { joinUrl } from "~/utils/core/url"
import { t } from "~/utils/i18n/core"

const logger = createLogger("ApiService.AIHubMix")
// AIHubMix console traffic is pinned to the main origin even when detection
// starts from console.aihubmix.com.
const AIHUBMIX_API_USER_SELF_ENDPOINT = "/api/user/self"
// These `/call/usr/*` routes are web-session endpoints used only while
// importing an account from the logged-in browser session.
const AIHUBMIX_USER_INFO_ENDPOINT = "/call/usr/self"
const AIHUBMIX_ACCESS_TOKEN_ENDPOINT = "/call/usr/tkn"
const AIHUBMIX_MODEL_CATALOG_ENDPOINT = "/api/v1/models"
const AIHUBMIX_USER_AVAILABLE_MODELS_ENDPOINT = "/api/user/available_models"
const AIHUBMIX_WEB_AVAILABLE_MODELS_ENDPOINT = "/call/usr/avail_mdls"

const EMPTY_TODAY_USAGE: TodayUsageData = {
  today_quota_consumption: 0,
  today_prompt_tokens: 0,
  today_completion_tokens: 0,
  today_requests_count: 0,
}

const EMPTY_TODAY_INCOME: TodayIncomeData = {
  today_income: 0,
}

type AIHubMixUserInfo = {
  username: string
  display_name: string
  access_token?: string | null
  quota?: number | string
  used_quota?: number | string
  request_count?: number | string
}

type AIHubMixTokenRaw = Partial<ApiToken> & {
  full_key?: string
  token?: string
  token_id?: number | string
  value?: string
  ip_whitelist?: string
  subnet?: string
}

type AIHubMixUserAvailableModel = {
  model: string
  developer_id?: number
  order?: number
}

type AIHubMixModelCatalogItem = {
  model_id?: string
  id?: string
  name?: string
  desc?: string
  description?: string
  developer_id?: number | string
  developer_name?: string
  developer?: string
  owner_by?: string
  type?: string
  endpoints?: string[] | string
  pricing?: {
    cache_read?: number | string
    input?: number | string
    output?: number | string
  }
}

// AIHubMix create-key docs define the management payload as:
// name, expired_time, unlimited_quota, remain_quota, models, subnet.
// They do not define One-API style group/model_limits/allow_ips fields.
// Reference: https://docs.aihubmix.com/en/api/CliEndpoints/create-key
type AIHubMixTokenPayload = {
  name: string
  expired_time: number
  unlimited_quota: boolean
  remain_quota: number
  models: string
  subnet: string
}

const toFiniteNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }
  return fallback
}

const normalizeAccessToken = (value: unknown): string =>
  typeof value === "string" ? value.trim() : ""

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

const extractAIHubMixData = <T>(body: unknown, endpoint: string): T => {
  if (!body || typeof body !== "object") {
    throw new ApiError(
      t("messages:errors.api.invalidResponseFormat"),
      undefined,
      endpoint,
    )
  }

  const response = body as Partial<ApiResponse<T>>
  if (response.success === false) {
    throw new ApiError(
      response.message || t("messages:errors.api.invalidResponseFormat"),
      undefined,
      endpoint,
      API_ERROR_CODES.BUSINESS_ERROR,
    )
  }

  return ("data" in response ? response.data : body) as T
}

const fetchAIHubMixData = async <T>(
  request: ApiServiceRequest,
  endpoint: string,
  options: RequestInit = {},
): Promise<T> => {
  const accessToken = normalizeAccessToken(request.auth?.accessToken)
  if (!accessToken) {
    throw new ApiError(
      t("messages:operations.detection.getInfoFailed"),
      401,
      endpoint,
      API_ERROR_CODES.HTTP_401,
    )
  }

  const method = (options.method ?? "GET").toUpperCase()
  const headers = new Headers(options.headers)
  if (!headers.has("Authorization")) {
    // AIHubMix documents raw access-token auth, not `Bearer <token>`.
    headers.set("Authorization", accessToken)
  }
  if (method !== "GET" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  const response = await fetch(joinUrl(AIHUBMIX_API_ORIGIN, endpoint), {
    ...options,
    method,
    headers,
    credentials: "omit",
  })

  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    body = null
  }

  if (!response.ok) {
    const message =
      body &&
      typeof body === "object" &&
      typeof (body as any).message === "string"
        ? (body as any).message
        : t("messages:errors.api.requestFailed", { status: response.status })
    throw new ApiError(message, response.status, endpoint)
  }

  return extractAIHubMixData<T>(body, endpoint)
}

const normalizeToken = (
  token: AIHubMixTokenRaw,
  defaultUserId?: number | string,
): ApiToken => {
  const key = token.full_key ?? token.key ?? token.token ?? token.value ?? ""
  const modelLimits =
    typeof token.model_limits === "string"
      ? token.model_limits
      : typeof token.models === "string"
        ? token.models
        : ""
  const allowIps =
    typeof token.allow_ips === "string"
      ? token.allow_ips
      : typeof token.ip_whitelist === "string"
        ? token.ip_whitelist
        : typeof token.subnet === "string"
          ? token.subnet
          : ""

  return normalizeApiTokenKey({
    id: toFiniteNumber(token.id ?? token.token_id),
    user_id: toFiniteNumber(token.user_id ?? defaultUserId),
    key,
    status: toFiniteNumber(token.status, 1),
    name: typeof token.name === "string" ? token.name : "",
    note: token.note,
    created_time: toFiniteNumber(token.created_time),
    accessed_time: toFiniteNumber(token.accessed_time),
    expired_time: toFiniteNumber(token.expired_time, -1),
    remain_quota: toFiniteNumber(token.remain_quota),
    unlimited_quota: Boolean(token.unlimited_quota),
    model_limits_enabled: Boolean(token.model_limits_enabled) || !!modelLimits,
    model_limits: modelLimits,
    allow_ips: allowIps,
    used_quota: toFiniteNumber(token.used_quota),
    group: typeof token.group === "string" ? token.group : undefined,
    DeletedAt: token.DeletedAt ?? null,
    models: typeof token.models === "string" ? token.models : undefined,
  })
}

const createAIHubMixTokenPayload = (
  tokenData: CreateTokenRequest,
): AIHubMixTokenPayload => ({
  name: tokenData.name,
  expired_time: tokenData.expired_time,
  unlimited_quota: tokenData.unlimited_quota,
  remain_quota: tokenData.unlimited_quota ? -1 : tokenData.remain_quota,
  models: tokenData.model_limits_enabled ? tokenData.model_limits : "",
  subnet: (tokenData.allow_ips ?? "").trim(),
})

const extractTokenItems = (payload: unknown): AIHubMixTokenRaw[] => {
  if (Array.isArray(payload)) return payload as AIHubMixTokenRaw[]
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>
    if (Array.isArray(record.items)) return record.items as AIHubMixTokenRaw[]
    if (Array.isArray(record.data)) return record.data as AIHubMixTokenRaw[]
  }
  return []
}

const normalizeModelIds = (payload: unknown): string[] => {
  if (Array.isArray(payload)) {
    return Array.from(
      new Set(
        payload.flatMap((item) => {
          if (typeof item === "string") {
            const normalized = item.trim()
            return normalized ? [normalized] : []
          }
          if (item && typeof item === "object") {
            const record = item as Record<string, unknown>
            const id = record.id ?? record.model ?? record.name
            if (typeof id === "string") {
              const normalized = id.trim()
              return normalized ? [normalized] : []
            }
            return []
          }
          return []
        }),
      ),
    )
  }

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>
    return Array.from(
      new Set(
        Object.values(record).flatMap((value) => {
          if (Array.isArray(value)) return normalizeModelIds(value)
          if (typeof value === "string") {
            const normalized = value.trim()
            return normalized ? [normalized] : []
          }
          return []
        }),
      ),
    )
  }

  return []
}

const normalizeUserScopedModelIds = (
  payload: unknown,
  endpoint: string,
): string[] => {
  if (Array.isArray(payload)) {
    return normalizeModelIds(payload)
  }

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>
    for (const field of ["data", "items", "models"]) {
      const value = record[field]
      if (Array.isArray(value)) {
        return normalizeModelIds(value)
      }
    }
  }

  throw new ApiError(
    t("messages:errors.api.invalidResponseFormat"),
    undefined,
    endpoint,
  )
}

const normalizeStringList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  }

  return []
}

const getAIHubMixCatalogModelId = (model: AIHubMixModelCatalogItem): string => {
  const candidate = model.model_id ?? model.id ?? model.name ?? ""
  return typeof candidate === "string" ? candidate.trim() : ""
}

const getNonEmptyCatalogString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined
  const normalized = value.trim()
  return normalized || undefined
}

const getDeveloperExternalId = (value: unknown): string | undefined => {
  if (typeof value === "string") return getNonEmptyCatalogString(value)
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  return undefined
}

const buildAIHubMixVendorEvidence = (
  modelId: string,
  catalogItem?: AIHubMixModelCatalogItem,
): ModelVendorEvidence | undefined => {
  const developerName =
    getNonEmptyCatalogString(catalogItem?.developer_name) ??
    getNonEmptyCatalogString(catalogItem?.developer)
  const routingOwner = getNonEmptyCatalogString(catalogItem?.owner_by)
  const externalId = developerName
    ? getDeveloperExternalId(catalogItem?.developer_id)
    : undefined

  // Official Models API docs describe only legacy `owned_by` as Developer.
  // Optional `developer_name`, `developer`, and `owner_by` names are used only
  // when present; the current public ID-only shape intentionally emits no
  // evidence because a standalone `developer_id` is opaque.
  // https://docs.aihubmix.com/en/api/Models-API.md
  const candidate = developerName
    ? {
        kind: MODEL_VENDOR_EVIDENCE_KINDS.Publisher,
        name: developerName,
        ...(externalId === undefined ? {} : { externalId }),
      }
    : routingOwner
      ? {
          kind: MODEL_VENDOR_EVIDENCE_KINDS.RoutingProvider,
          name: routingOwner,
        }
      : undefined

  return normalizeModelDescriptors([
    {
      id: modelId,
      ...(candidate === undefined ? {} : { vendorEvidence: candidate }),
    },
  ])[0]?.vendorEvidence
}

const buildAIHubMixModelPricing = (
  modelId: string,
  catalogItem?: AIHubMixModelCatalogItem,
): ModelPricing => {
  const inputPrice = toFiniteNumber(catalogItem?.pricing?.input)
  const outputPrice = toFiniteNumber(catalogItem?.pricing?.output)
  const cacheReadPrice = toFiniteNumber(catalogItem?.pricing?.cache_read)
  const hasTokenPricing = inputPrice > 0 || outputPrice > 0
  const vendorEvidence = buildAIHubMixVendorEvidence(modelId, catalogItem)

  return {
    model_name: modelId,
    ...(vendorEvidence === undefined ? {} : { vendorEvidence }),
    model_description:
      typeof catalogItem?.desc === "string"
        ? catalogItem.desc
        : typeof catalogItem?.description === "string"
          ? catalogItem.description
          : "",
    quota_type: 0,
    model_ratio: 0,
    model_price: 0,
    // AIHubMix /api/v1/models pricing fields are direct USD-per-1M-token prices.
    // Do not route them through the New API ratio formula where ratio 1 maps to $2/M.
    token_price_usd_per_million: hasTokenPricing
      ? {
          cache_read: cacheReadPrice,
          input: inputPrice,
          output: outputPrice,
        }
      : undefined,
    owner_by:
      typeof catalogItem?.developer_name === "string"
        ? catalogItem.developer_name
        : typeof catalogItem?.developer === "string"
          ? catalogItem.developer
          : typeof catalogItem?.owner_by === "string"
            ? catalogItem.owner_by
            : catalogItem?.developer_id != null
              ? String(catalogItem.developer_id)
              : undefined,
    completion_ratio: 0,
    enable_groups: [],
    supported_endpoint_types: normalizeStringList(catalogItem?.endpoints),
  }
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
 * Return static AIHubMix site metadata for account setup.
 */
export async function fetchSiteStatus(
  _request: ApiServiceRequest,
): Promise<SiteStatusInfo> {
  return {
    system_name: "AIHubMix",
    checkin_enabled: false,
  }
}

/**
 * Return AIHubMix's app-level default exchange rate.
 */
export function extractDefaultExchangeRate(
  _statusInfo: SiteStatusInfo | null,
): number {
  // AIHubMix public management docs expose quota accounting
  // (`used_quota / 500000`) but no site-status default exchange-rate field.
  // Reference: https://docs.aihubmix.com/cn/api/CliEndpoints/list-keys
  return UI_CONSTANTS.EXCHANGE_RATE.DEFAULT
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
 * AIHubMix check-in state is not supported by the first adapter version.
 */
export async function fetchCheckInStatus(
  _request: ApiServiceRequest,
): Promise<boolean | undefined> {
  return undefined
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
 * Return zeroed daily usage until AIHubMix exposes a stable daily stat endpoint.
 */
export async function fetchTodayUsage(
  _request: ApiServiceRequest,
): Promise<TodayUsageData> {
  return { ...EMPTY_TODAY_USAGE }
}

/**
 * Return zeroed daily income until AIHubMix exposes a stable daily stat endpoint.
 */
export async function fetchTodayIncome(
  _request: ApiServiceRequest,
): Promise<TodayIncomeData> {
  return { ...EMPTY_TODAY_INCOME }
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
    today_quota_consumption: toFiniteNumber(userInfo.used_quota),
    today_prompt_tokens: 0,
    today_completion_tokens: 0,
    today_requests_count: 0,
    today_income: 0,
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
 * Validate that the saved AIHubMix access token can read account quota.
 */
export async function validateAccountConnection(
  request: ApiServiceRequest,
): Promise<boolean> {
  try {
    await fetchAccountQuota(request)
    return true
  } catch (error) {
    logger.error("AIHubMix account connection validation failed", error)
    return false
  }
}

/**
 * Fetch and normalize AIHubMix API keys.
 */
export async function fetchAccountTokens(
  request: ApiServiceRequest,
): Promise<ApiToken[]> {
  const payload = await fetchAIHubMixData<unknown>(request, "/api/token/")
  return extractTokenItems(payload).map((token) =>
    normalizeToken(token, request.auth?.userId),
  )
}

/**
 * Search and normalize AIHubMix API keys by keyword.
 */
export async function searchApiTokens(
  request: ApiServiceRequest,
  keyword: string,
): Promise<ApiToken[]> {
  const searchParams = new URLSearchParams({
    keyword,
  })
  const payload = await fetchAIHubMixData<unknown>(
    request,
    `/api/token/search?${searchParams.toString()}`,
  )
  return extractTokenItems(payload).map((token) =>
    normalizeToken(token, request.auth?.userId),
  )
}

/**
 * Fetch and normalize one AIHubMix API key by id.
 */
export async function fetchTokenById(
  request: ApiServiceRequest,
  tokenId: number,
): Promise<ApiToken> {
  const endpoint = `/api/token/${tokenId}`
  const payload = await fetchAIHubMixData<AIHubMixTokenRaw>(request, endpoint)
  return normalizeToken(payload, request.auth?.userId)
}

/**
 * AIHubMix only exposes a key secret when it is created. Saved/listed keys may
 * be masked and cannot be revealed again through detail APIs, so this adapter
 * must not fall back to common `/api/token/{id}/key` behavior.
 */
export async function resolveApiTokenKey(
  _request: ApiServiceRequest,
  token: Pick<ApiToken, "key">,
): Promise<string> {
  const normalizedKey = normalizeApiTokenKeyValue(token.key ?? "")
  if (!normalizedKey) return normalizedKey
  if (hasUsableApiTokenKey(normalizedKey)) return normalizedKey
  if (!isMaskedApiTokenKey(normalizedKey)) return normalizedKey

  throw new ApiError(
    t("messages:errors.tokenSecretUnavailable"),
    undefined,
    undefined,
    API_ERROR_CODES.TOKEN_SECRET_UNAVAILABLE,
  )
}

/**
 * Create an AIHubMix API key.
 * AIHubMix may include the only full key value in this response; later list or
 * detail reads can be masked and are not revealable.
 */
export async function createApiToken(
  request: ApiServiceRequest,
  tokenData: CreateTokenRequest,
): Promise<CreateTokenResult> {
  const payload = createAIHubMixTokenPayload(tokenData)
  const createdToken = await fetchAIHubMixData<AIHubMixTokenRaw>(
    request,
    "/api/token/",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  )

  if (createdToken && typeof createdToken === "object") {
    return normalizeToken(createdToken, request.auth?.userId)
  }

  return true
}

/**
 * Update an AIHubMix API key.
 */
export async function updateApiToken(
  request: ApiServiceRequest,
  tokenId: number,
  tokenData: CreateTokenRequest,
): Promise<boolean> {
  const payload = createAIHubMixTokenPayload(tokenData)
  await fetchAIHubMixData<unknown>(request, "/api/token/", {
    method: "PUT",
    body: JSON.stringify({ ...payload, id: tokenId }),
  })
  return true
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

const fetchAIHubMixModelCatalog = async (
  request: ApiServiceRequest,
): Promise<AIHubMixModelCatalogItem[]> => {
  const payload = await fetchAIHubMixData<unknown>(
    request,
    AIHUBMIX_MODEL_CATALOG_ENDPOINT,
  )

  if (Array.isArray(payload)) {
    return payload.filter(
      (item): item is AIHubMixModelCatalogItem =>
        !!item && typeof item === "object",
    )
  }

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>
    if (Array.isArray(record.data)) {
      return record.data.filter(
        (item): item is AIHubMixModelCatalogItem =>
          !!item && typeof item === "object",
      )
    }
  }

  throw new ApiError(
    t("messages:errors.api.invalidResponseFormat"),
    undefined,
    AIHUBMIX_MODEL_CATALOG_ENDPOINT,
  )
}

const fetchAIHubMixUserScopedModelIds = async (
  request: ApiServiceRequest,
): Promise<string[] | null> => {
  try {
    const payload = await fetchAIHubMixData<AIHubMixUserAvailableModel[]>(
      request,
      AIHUBMIX_USER_AVAILABLE_MODELS_ENDPOINT,
    )
    return normalizeUserScopedModelIds(
      payload,
      AIHUBMIX_USER_AVAILABLE_MODELS_ENDPOINT,
    )
  } catch (error) {
    logger.warn(
      "Failed to fetch AIHubMix API user available models; trying web available models",
      error,
    )
  }

  try {
    const payload = await fetchAIHubMixData<AIHubMixUserAvailableModel[]>(
      request,
      AIHUBMIX_WEB_AVAILABLE_MODELS_ENDPOINT,
    )
    return normalizeUserScopedModelIds(
      payload,
      AIHUBMIX_WEB_AVAILABLE_MODELS_ENDPOINT,
    )
  } catch (error) {
    logger.warn(
      "Failed to fetch AIHubMix web available models; using catalog fallback",
      error,
    )
    return null
  }
}

const buildAIHubMixPricingResponse = (params: {
  catalog: AIHubMixModelCatalogItem[]
  userScopedModelIds: string[] | null
}): PricingResponse => {
  const catalogByModelId = new Map<string, AIHubMixModelCatalogItem>()

  for (const item of params.catalog) {
    const modelId = getAIHubMixCatalogModelId(item)
    if (modelId && !catalogByModelId.has(modelId)) {
      catalogByModelId.set(modelId, item)
    }
  }

  const modelIds =
    params.userScopedModelIds === null
      ? Array.from(catalogByModelId.keys())
      : params.userScopedModelIds

  return {
    success: true,
    group_ratio: {},
    usable_group: {},
    model_list_source: {
      kind:
        params.userScopedModelIds === null
          ? MODEL_LIST_SOURCE_KINDS.CATALOG_FALLBACK
          : MODEL_LIST_SOURCE_KINDS.USER_SCOPED,
      provider: SITE_TYPES.AIHUBMIX,
    },
    data: modelIds.map((modelId) =>
      buildAIHubMixModelPricing(modelId, catalogByModelId.get(modelId)),
    ),
  }
}

/**
 * Fetch AIHubMix model pricing from the complete catalog and current user scope.
 */
export async function fetchModelPricing(
  request: ApiServiceRequest,
): Promise<PricingResponse> {
  const catalog = await fetchAIHubMixModelCatalog(request)
  const userScopedModelIds = await fetchAIHubMixUserScopedModelIds(request)

  return buildAIHubMixPricingResponse({
    catalog,
    userScopedModelIds,
  })
}

/**
 * Fetch AIHubMix model ids available to the current account.
 */
export async function fetchAccountAvailableModels(
  request: ApiServiceRequest,
): Promise<string[]> {
  const userScopedModelIds = await fetchAIHubMixUserScopedModelIds(request)
  if (userScopedModelIds !== null) {
    return userScopedModelIds
  }

  return fetchAllModels(request)
}

/**
 * Fetch all AIHubMix model ids when a caller needs the global model catalog.
 */
export async function fetchAllModels(
  request: ApiServiceRequest,
): Promise<string[]> {
  const catalog = await fetchAIHubMixModelCatalog(request)
  return Array.from(
    new Set(catalog.map(getAIHubMixCatalogModelId).filter(Boolean)),
  )
}
