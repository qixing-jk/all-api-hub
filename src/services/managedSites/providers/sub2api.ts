import { ChannelType, DEFAULT_CHANNEL_FIELDS } from "~/constants/managedSite"
import { normalizeAccountForManagedChannel } from "~/services/accounts/utils/siteUrlNormalization"
import type { ApiTransportRequestObserver } from "~/services/apiTransport/type"
import { fetchTokenScopedModels } from "~/services/managedSites/utils/fetchTokenScopedModels"
import type { AccountToken, ApiToken, DisplaySiteData } from "~/types"
import type {
  ChannelFormData,
  ChannelMode,
  CreateChannelPayload,
  ManagedSiteChannel,
  ManagedSiteChannelListData,
} from "~/types/managedSite"
import { CHANNEL_MODE, CHANNEL_STATUS } from "~/types/managedSite"
import {
  SUB2API_API_KEY_ACCOUNT_PLATFORMS,
  type Sub2ApiAdminAccountListData,
  type Sub2ApiAdminApiKeyAccount,
  type Sub2ApiAdminDataPayload,
  type Sub2ApiAdminEnvelope,
  type Sub2ApiApiKeyAccountPlatform,
  type Sub2ApiApiKeyAccountStatus,
} from "~/types/sub2apiManagedSite"
import type { Sub2ApiManagedSiteConfig } from "~/types/sub2apiManagedSiteConfig"
import { normalizeList } from "~/utils/core/string"
import { joinUrl, normalizeBaseUrl } from "~/utils/core/url"

const SUB2API_ADMIN_ACCOUNTS_ENDPOINT = "/api/v1/admin/accounts"
const SUB2API_ADMIN_ACCOUNTS_DATA_ENDPOINT = "/api/v1/admin/accounts/data"
const PAGE_SIZE = 100
const MAX_LIST_PAGES = 100
const MASKED_API_KEY = "********"
export const SUB2API_STEP_UP_ADMIN_KEY_FORBIDDEN_CODE =
  "STEP_UP_ADMIN_API_KEY_FORBIDDEN"
const SUB2API_STEP_UP_UNSUPPORTED_MESSAGE =
  "This Sub2API deployment requires step-up authentication to reveal API keys. URL + Admin API Key mode cannot reveal the saved key."

type Sub2ApiAdminRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE"
  body?: unknown
  query?: Record<string, string | number | boolean | undefined>
  signal?: AbortSignal
  observer?: ApiTransportRequestObserver
}

type Sub2ApiAdminErrorEvidence = {
  dispatch: "not-dispatched" | "dispatched"
  responseReceived: boolean
  confirmedNonApplication: boolean
  raw?: unknown
}

/** Carries enough transport evidence to classify managed-site mutations. */
export class Sub2ApiAdminApiError extends Error {
  readonly name = "Sub2ApiAdminApiError"

  constructor(
    message: string,
    readonly status: number | undefined,
    readonly code: string | number | undefined,
    readonly evidence: Sub2ApiAdminErrorEvidence,
  ) {
    super(message)
  }
}

export type Sub2ApiApiKeyAccountCreateInput = {
  name: string
  platform: Sub2ApiApiKeyAccountPlatform
  baseUrl: string
  apiKey: string
  concurrency?: number
  priority?: number
  notes?: string
}

export type Sub2ApiApiKeyAccountUpdateInput = {
  name?: string
  baseUrl?: string
  apiKey?: string
  concurrency?: number
  priority?: number
  status?: Sub2ApiApiKeyAccountStatus
  notes?: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value))

const isSub2ApiPlatform = (
  value: unknown,
): value is Sub2ApiApiKeyAccountPlatform =>
  typeof value === "string" &&
  SUB2API_API_KEY_ACCOUNT_PLATFORMS.includes(
    value as Sub2ApiApiKeyAccountPlatform,
  )

const buildAdminUrl = (
  config: Sub2ApiManagedSiteConfig,
  endpoint: string,
  query?: Sub2ApiAdminRequestOptions["query"],
) => {
  const url = new URL(joinUrl(config.baseUrl, endpoint))
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value))
  }
  return url.toString()
}

const getEnvelopeMessage = (envelope: unknown, fallback: string) => {
  if (!isRecord(envelope)) return fallback
  if (typeof envelope.message === "string" && envelope.message.trim()) {
    return envelope.message
  }
  if (typeof envelope.error === "string" && envelope.error.trim()) {
    return envelope.error
  }
  return fallback
}

const getEnvelopeCode = (envelope: unknown) =>
  isRecord(envelope) &&
  (typeof envelope.code === "string" || typeof envelope.code === "number")
    ? envelope.code
    : undefined

// Source: https://github.com/Wei-Shaw/sub2api/blob/48eb3766d2da817b171b45bb3036d42575e42b8f/backend/internal/handler/admin/account_handler.go
// Admin API-key account management uses /api/v1/admin/accounts and `x-api-key`.
/** Sends one authenticated request to the Sub2API admin API. */
async function sub2ApiAdminRequest<T>(
  config: Sub2ApiManagedSiteConfig,
  endpoint: string,
  options: Sub2ApiAdminRequestOptions = {},
): Promise<T> {
  const method = options.method ?? "GET"
  const hasBody = method !== "GET" && options.body !== undefined
  const headers: Record<string, string> = {
    Accept: "application/json",
    "x-api-key": config.adminToken,
  }
  if (hasBody) headers["Content-Type"] = "application/json"

  const request: RequestInit = {
    method,
    headers,
    ...(hasBody ? { body: JSON.stringify(options.body) } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  }

  options.observer?.onDispatch?.()
  let response: Response
  try {
    response = await fetch(
      buildAdminUrl(config, endpoint, options.query),
      request,
    )
  } catch (error) {
    throw new Sub2ApiAdminApiError(
      "Sub2API admin request failed",
      undefined,
      undefined,
      {
        dispatch: "dispatched",
        responseReceived: false,
        confirmedNonApplication: false,
        raw: error,
      },
    )
  }
  options.observer?.onResponse?.()

  let envelope: Sub2ApiAdminEnvelope<T>
  try {
    envelope = (await response.json()) as Sub2ApiAdminEnvelope<T>
  } catch (error) {
    throw new Sub2ApiAdminApiError(
      "Sub2API returned an invalid admin response",
      response.status,
      undefined,
      {
        dispatch: "dispatched",
        responseReceived: true,
        confirmedNonApplication: response.status >= 400,
        raw: error,
      },
    )
  }

  const code = getEnvelopeCode(envelope)
  const businessFailed =
    code !== undefined && code !== 0 && code !== "0" && code !== "success"
  if (
    !response.ok ||
    businessFailed ||
    !isRecord(envelope) ||
    !("data" in envelope)
  ) {
    throw new Sub2ApiAdminApiError(
      code === SUB2API_STEP_UP_ADMIN_KEY_FORBIDDEN_CODE
        ? SUB2API_STEP_UP_UNSUPPORTED_MESSAGE
        : getEnvelopeMessage(envelope, "Sub2API admin request failed"),
      response.status,
      code,
      {
        dispatch: "dispatched",
        responseReceived: true,
        confirmedNonApplication: true,
        raw: envelope,
      },
    )
  }

  return envelope.data as T
}

const listPage = async (
  config: Sub2ApiManagedSiteConfig,
  page: number,
  search: string | undefined,
  options?: { signal?: AbortSignal; observer?: ApiTransportRequestObserver },
) =>
  await sub2ApiAdminRequest<Sub2ApiAdminAccountListData>(
    config,
    SUB2API_ADMIN_ACCOUNTS_ENDPOINT,
    {
      query: {
        page,
        page_size: PAGE_SIZE,
        type: "apikey",
        sort_by: "name",
        sort_order: "asc",
        ...(search ? { search } : {}),
      },
      signal: options?.signal,
      observer: options?.observer,
    },
  )

const listAllPages = async (
  config: Sub2ApiManagedSiteConfig,
  search: string | undefined,
  options?: {
    signal?: AbortSignal
    beforeRequest?: () => Promise<void>
    observer?: ApiTransportRequestObserver
  },
): Promise<{ items: Sub2ApiAdminApiKeyAccount[]; total: number }> => {
  await options?.beforeRequest?.()
  const first = await listPage(config, 1, search, options)
  const pages = Math.ceil(
    Math.max(1, first.pages ?? Math.ceil(first.total / PAGE_SIZE)),
  )
  if (!Number.isFinite(pages) || pages > MAX_LIST_PAGES) {
    throw new Sub2ApiAdminApiError(
      "Sub2API account inventory exceeds the safe pagination limit",
      200,
      "PAGINATION_LIMIT_EXCEEDED",
      {
        dispatch: "dispatched",
        responseReceived: true,
        confirmedNonApplication: true,
        raw: first,
      },
    )
  }
  const items = [...(first.items ?? [])]
  for (let page = 2; page <= pages; page += 1) {
    const next = await listPage(config, page, search, options)
    items.push(...(next.items ?? []))
  }
  return { items, total: first.total ?? items.length }
}

/** Validates admin-key access with one bounded read-only account request. */
export async function validateSub2ApiManagedSiteConfig(
  config: Sub2ApiManagedSiteConfig,
): Promise<void> {
  await listPage(config, 1, undefined)
}

/** Lists every Sub2API API-key account, following the upstream pagination. */
export async function listSub2ApiApiKeyAccounts(
  config: Sub2ApiManagedSiteConfig,
  options?: {
    signal?: AbortSignal
    beforeRequest?: () => Promise<void>
    observer?: ApiTransportRequestObserver
  },
): Promise<{ items: Sub2ApiAdminApiKeyAccount[]; total: number }> {
  return await listAllPages(config, undefined, options)
}

/** Uses Sub2API's native name-only search for the channel list. */
export async function searchSub2ApiApiKeyAccounts(
  config: Sub2ApiManagedSiteConfig,
  keyword: string,
  options?: { signal?: AbortSignal; observer?: ApiTransportRequestObserver },
): Promise<{ items: Sub2ApiAdminApiKeyAccount[]; total: number }> {
  const search = keyword.trim()
  return await listAllPages(config, search || undefined, options)
}

/** Loads one redacted account detail. */
export async function getSub2ApiApiKeyAccount(
  config: Sub2ApiManagedSiteConfig,
  accountId: number,
  options?: { signal?: AbortSignal },
) {
  return await sub2ApiAdminRequest<Sub2ApiAdminApiKeyAccount>(
    config,
    `${SUB2API_ADMIN_ACCOUNTS_ENDPOINT}/${accountId}`,
    options,
  )
}

// Source: https://github.com/Wei-Shaw/sub2api/blob/48eb3766d2da817b171b45bb3036d42575e42b8f/backend/internal/handler/admin/account_data.go
// The selected-account backup export intentionally returns raw credentials.
/** Reveals the selected API-key account secret through raw data export. */
export async function revealSub2ApiApiKey(
  config: Sub2ApiManagedSiteConfig,
  accountId: number,
  options?: { signal?: AbortSignal },
): Promise<string> {
  const payload = await sub2ApiAdminRequest<Sub2ApiAdminDataPayload>(
    config,
    SUB2API_ADMIN_ACCOUNTS_DATA_ENDPOINT,
    {
      query: { ids: accountId, include_proxies: false },
      signal: options?.signal,
    },
  )
  const exported = payload.accounts?.[0]
  const apiKey = exported?.credentials?.api_key
  if (
    exported?.type !== "apikey" ||
    typeof apiKey !== "string" ||
    !apiKey.trim()
  ) {
    throw new Sub2ApiAdminApiError(
      "Sub2API did not return an API key for the selected account",
      200,
      "API_KEY_UNAVAILABLE",
      {
        dispatch: "dispatched",
        responseReceived: true,
        confirmedNonApplication: true,
        raw: payload,
      },
    )
  }
  return apiKey
}

/** Creates one provider-native Sub2API API-key account. */
export async function createSub2ApiApiKeyAccount(
  config: Sub2ApiManagedSiteConfig,
  input: Sub2ApiApiKeyAccountCreateInput,
  options?: { observer?: ApiTransportRequestObserver },
) {
  return await sub2ApiAdminRequest<Sub2ApiAdminApiKeyAccount>(
    config,
    SUB2API_ADMIN_ACCOUNTS_ENDPOINT,
    {
      method: "POST",
      body: {
        name: input.name.trim(),
        platform: input.platform,
        type: "apikey",
        credentials: {
          base_url: input.baseUrl.trim(),
          api_key: input.apiKey.trim(),
        },
        ...(input.concurrency === undefined
          ? {}
          : { concurrency: input.concurrency }),
        ...(input.priority === undefined ? {} : { priority: input.priority }),
        ...(input.notes === undefined ? {} : { notes: input.notes }),
      },
      observer: options?.observer,
    },
  )
}

/** Updates mutable fields while preserving an omitted API key. */
export async function updateSub2ApiApiKeyAccount(
  config: Sub2ApiManagedSiteConfig,
  accountId: number,
  input: Sub2ApiApiKeyAccountUpdateInput,
  options?: { observer?: ApiTransportRequestObserver },
) {
  const credentials = {
    ...(input.baseUrl === undefined ? {} : { base_url: input.baseUrl.trim() }),
    ...(input.apiKey === undefined ? {} : { api_key: input.apiKey.trim() }),
  }
  return await sub2ApiAdminRequest<Sub2ApiAdminApiKeyAccount>(
    config,
    `${SUB2API_ADMIN_ACCOUNTS_ENDPOINT}/${accountId}`,
    {
      method: "PUT",
      body: {
        ...(input.name === undefined ? {} : { name: input.name.trim() }),
        ...(Object.keys(credentials).length ? { credentials } : {}),
        ...(input.concurrency === undefined
          ? {}
          : { concurrency: input.concurrency }),
        ...(input.priority === undefined ? {} : { priority: input.priority }),
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.notes === undefined ? {} : { notes: input.notes }),
      },
      observer: options?.observer,
    },
  )
}

/** Deletes one Sub2API API-key account. */
export async function deleteSub2ApiApiKeyAccount(
  config: Sub2ApiManagedSiteConfig,
  accountId: number,
  options?: { observer?: ApiTransportRequestObserver },
): Promise<void> {
  await sub2ApiAdminRequest<unknown>(
    config,
    `${SUB2API_ADMIN_ACCOUNTS_ENDPOINT}/${accountId}`,
    { method: "DELETE", observer: options?.observer },
  )
}

export const sub2ApiPlatformToChannelType = (
  platform: Sub2ApiApiKeyAccountPlatform,
): ChannelType => {
  switch (platform) {
    case "anthropic":
      return ChannelType.Anthropic
    case "gemini":
      return ChannelType.Gemini
    case "grok":
      return ChannelType.Xai
    case "antigravity":
      return ChannelType.Custom
    case "openai":
    default:
      return ChannelType.OpenAI
  }
}

export const sub2ApiChannelTypeToPlatform = (
  channelType: unknown,
): Sub2ApiApiKeyAccountPlatform => {
  if (channelType === ChannelType.Anthropic) return "anthropic"
  if (channelType === ChannelType.Gemini) return "gemini"
  if (channelType === ChannelType.Xai) return "grok"
  if (channelType === ChannelType.Custom) return "antigravity"
  return "openai"
}

/** Projects a redacted Sub2API account into the legacy channel contract. */
export function sub2ApiAccountToManagedSiteChannel(
  account: Sub2ApiAdminApiKeyAccount,
): ManagedSiteChannel {
  const baseUrl = account.credentials?.base_url
  return {
    id: account.id,
    type: sub2ApiPlatformToChannelType(account.platform),
    key: account.credentials_status?.has_api_key ? MASKED_API_KEY : "",
    name: account.name || `Sub2API Account ${account.id}`,
    base_url: typeof baseUrl === "string" ? baseUrl : "",
    models: "",
    status:
      account.status === "active"
        ? CHANNEL_STATUS.Enable
        : CHANNEL_STATUS.ManuallyDisabled,
    weight: account.concurrency ?? DEFAULT_CHANNEL_FIELDS.weight,
    priority: account.priority ?? DEFAULT_CHANNEL_FIELDS.priority,
    openai_organization: null,
    test_model: null,
    created_time: 0,
    test_time: 0,
    response_time: 0,
    other: "",
    balance: 0,
    balance_updated_time: 0,
    group: "",
    used_quota: 0,
    model_mapping: "",
    status_code_mapping: "",
    auto_ban: 0,
    other_info: "",
    tag: null,
    param_override: null,
    header_override: null,
    remark: account.notes ?? null,
    channel_info: {
      is_multi_key: false,
      multi_key_size: 1,
      multi_key_status_list: null,
      multi_key_polling_index: 0,
      multi_key_mode: "",
    },
    setting: "",
    settings: "",
  }
}

export const toSub2ApiManagedSiteChannelList = (data: {
  items: Sub2ApiAdminApiKeyAccount[]
  total: number
}): ManagedSiteChannelListData => ({
  items: data.items
    .filter((item) => item.type === "apikey")
    .map(sub2ApiAccountToManagedSiteChannel),
  total: data.total,
  type_counts: {},
})

/** Fetches token-scoped models for an imported URL + key draft. */
export async function fetchAvailableModels(
  account: DisplaySiteData,
  token: ApiToken,
): Promise<string[]> {
  const upstream = normalizeSub2ApiManagedChannelAccount(account)
  const { models } = await fetchTokenScopedModels(upstream, token)
  return normalizeList(models)
}

/** Builds the default managed-channel name for an imported credential. */
export function buildChannelName(
  account: DisplaySiteData,
  token: ApiToken,
): string {
  const baseName = `${account.name} | ${token.name}`.trim()
  return baseName.endsWith("(auto)") ? baseName : `${baseName} (auto)`
}

/** Normalizes an imported account at the Sub2API adapter boundary. */
function normalizeSub2ApiManagedChannelAccount<
  TAccount extends DisplaySiteData,
>(account: TAccount): TAccount {
  const upstream = normalizeAccountForManagedChannel(account)
  return {
    ...upstream,
    baseUrl: normalizeBaseUrl(upstream.baseUrl),
  }
}

/** Prepares the existing import editor draft for a Sub2API API-key account. */
export async function prepareChannelFormData(
  account: DisplaySiteData,
  token: ApiToken | AccountToken,
): Promise<ChannelFormData> {
  const upstream = normalizeSub2ApiManagedChannelAccount(account)
  const { models, fetchFailed } = await fetchTokenScopedModels(upstream, token)
  return {
    name: buildChannelName(account, token as ApiToken),
    type: DEFAULT_CHANNEL_FIELDS.type,
    key: token.key,
    base_url: upstream.baseUrl,
    models: normalizeList(models),
    ...(fetchFailed ? { modelPrefillFetchFailed: true } : {}),
    groups: [],
    priority: DEFAULT_CHANNEL_FIELDS.priority,
    weight: DEFAULT_CHANNEL_FIELDS.weight,
    status: DEFAULT_CHANNEL_FIELDS.status,
  }
}

/** Converts an import editor draft into the shared channel-create payload. */
export function buildChannelPayload(
  formData: ChannelFormData,
  mode: ChannelMode = CHANNEL_MODE.SINGLE,
): CreateChannelPayload {
  return {
    mode,
    channel: {
      name: formData.name.trim(),
      type: formData.type,
      key: formData.key.trim(),
      base_url: formData.base_url.trim(),
      models: normalizeList(formData.models).join(","),
      groups: [],
      priority: formData.priority,
      weight: formData.weight,
      status: formData.status,
    },
  }
}
