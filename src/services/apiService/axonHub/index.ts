import { AXON_HUB_CHANNEL_STATUS } from "~/constants/axonHub"
import type {
  ApiResponse,
  ApiServiceRequest,
} from "~/services/apiService/common/type"
import type {
  AxonHubChannel,
  AxonHubCreateChannelInput,
  AxonHubUpdateChannelInput,
} from "~/types/axonHub"
import type { AxonHubConfig } from "~/types/axonHubConfig"
import {
  CHANNEL_STATUS,
  type ManagedSiteChannelListData,
} from "~/types/managedSite"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { normalizeList } from "~/utils/core/string"

const logger = createLogger("AxonHubApiService")

const QUERY_CHANNELS = `
  query QueryChannels($input: QueryChannelInput!) {
    queryChannels(input: $input) {
      edges {
        node {
          id
          createdAt
          updatedAt
          type
          baseURL
          name
          status
          credentials {
            apiKey
            apiKeys
            gcp {
              region
              projectID
              jsonData
            }
          }
          supportedModels
          manualModels
          tags
          defaultTestModel
          settings {
            extraModelPrefix
            modelMappings {
              from
              to
            }
            autoTrimedModelPrefixes
            hideOriginalModels
            hideMappedModels
            passThroughUserAgent
            passThroughBody
            rateLimit {
              rpm
              tpm
              maxConcurrent
            }
          }
          orderingWeight
          errorMessage
          remark
          disabledAPIKeys {
            key
            disabledAt
            errorCode
            reason
          }
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
      totalCount
    }
  }
`

const CREATE_CHANNEL = `
  mutation CreateChannel($input: CreateChannelInput!) {
    createChannel(input: $input) {
      id
      type
      baseURL
      name
      status
      credentials {
        apiKey
        apiKeys
      }
      supportedModels
      manualModels
      defaultTestModel
      settings {
        modelMappings {
          from
          to
        }
      }
      orderingWeight
      remark
    }
  }
`

const UPDATE_CHANNEL = `
  mutation UpdateChannel($id: ID!, $input: UpdateChannelInput!) {
    updateChannel(id: $id, input: $input) {
      id
      type
      baseURL
      name
      status
      credentials {
        apiKey
        apiKeys
      }
      supportedModels
      manualModels
      defaultTestModel
      settings {
        modelMappings {
          from
          to
        }
      }
      orderingWeight
      errorMessage
      remark
    }
  }
`

const UPDATE_CHANNEL_STATUS = `
  mutation UpdateChannelStatus($id: ID!, $status: ChannelStatus!) {
    updateChannelStatus(id: $id, status: $status) {
      id
      status
    }
  }
`

const DELETE_CHANNEL = `
  mutation DeleteChannel($id: ID!) {
    deleteChannel(id: $id)
  }
`

interface GraphQLResponse<T> {
  data?: T
  errors?: Array<{ message?: string }>
}

interface QueryChannelsData {
  queryChannels: {
    edges: Array<{ node: AxonHubChannel; cursor?: string | null }>
    pageInfo?: { hasNextPage?: boolean; endCursor?: string | null }
    totalCount?: number
  }
}

const tokenCache = new Map<string, string>()
const channelListCache = new Map<
  string,
  {
    data: ManagedSiteChannelListData
    expiresAt: number
  }
>()
const numericIdToGraphqlId = new Map<number, string>()
const CHANNEL_LIST_CACHE_TTL_MS = 15_000
const MAX_LIST_CHANNEL_PAGES = 100

const normalizeBaseUrl = (baseUrl: string) => baseUrl.trim().replace(/\/+$/, "")

const cacheKeyForConfig = (config: AxonHubConfig) =>
  `${normalizeBaseUrl(config.baseUrl)}|${config.email.trim().toLowerCase()}`

const invalidateChannelListCache = (config: AxonHubConfig) => {
  channelListCache.delete(cacheKeyForConfig(config))
}

export const __resetCachesForTesting = () => {
  tokenCache.clear()
  channelListCache.clear()
  numericIdToGraphqlId.clear()
}

const extractRequestConfig = (request: ApiServiceRequest): AxonHubConfig => ({
  baseUrl: request.baseUrl,
  email: String(request.auth.userId ?? ""),
  password: request.auth.accessToken ?? "",
})

const numericIdFromGraphqlId = (id: string): number => {
  const parsed = Number(id)
  if (Number.isSafeInteger(parsed) && parsed > 0) {
    numericIdToGraphqlId.set(parsed, id)
    return parsed
  }

  let hash = 0
  for (const char of id) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  }
  let numericId = hash || 1
  // GraphQL IDs can be opaque strings; keep a reversible session map for UI
  // mutations that only pass the New API-shaped numeric row id back down.
  // Probe forward on collision so distinct opaque ids never share a slot.
  while (true) {
    const existing = numericIdToGraphqlId.get(numericId)
    if (!existing || existing === id) {
      break
    }
    numericId = (numericId + 1) >>> 0 || 1
  }
  numericIdToGraphqlId.set(numericId, id)
  return numericId
}

export const resolveAxonHubGraphqlId = (id: number) =>
  numericIdToGraphqlId.get(id) ?? String(id)

const toSafeErrorMessage = (error: unknown, fallback: string) => {
  const message = getErrorMessage(error)
  if (!message) return fallback
  return message.replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [redacted]")
}

/**
 * Sign in to AxonHub admin and cache the returned session token.
 */
export async function signIn(config: AxonHubConfig): Promise<string> {
  const baseUrl = normalizeBaseUrl(config.baseUrl)

  try {
    const response = await fetch(`${baseUrl}/admin/auth/signin`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: config.email,
        password: config.password,
      }),
    })

    const data = (await response.json().catch(() => ({}))) as {
      token?: string
      message?: string
      error?: string | { message?: string }
    }

    if (!response.ok || !data.token) {
      const fallbackMessage = `AxonHub sign-in failed (HTTP ${response.status})`
      const message =
        data.message ||
        (typeof data.error === "string" ? data.error : data.error?.message) ||
        fallbackMessage
      throw new Error(message)
    }

    tokenCache.set(cacheKeyForConfig(config), data.token)
    return data.token
  } catch (error) {
    throw new Error(toSafeErrorMessage(error, "AxonHub sign-in failed"))
  }
}

const getSessionToken = async (config: AxonHubConfig, forceRefresh = false) => {
  const key = cacheKeyForConfig(config)
  if (!forceRefresh) {
    const cachedToken = tokenCache.get(key)
    if (cachedToken) return cachedToken
  }

  tokenCache.delete(key)
  return signIn(config)
}

const isUnauthorized = (
  response: Response,
  errors?: Array<{ message?: string }>,
) =>
  response.status === 401 ||
  response.status === 403 ||
  Boolean(
    errors?.some((error) =>
      /unauthorized|unauthenticated|jwt expired|jwt invalid|invalid jwt|invalid token|expired token|session expired|access token expired|access token invalid|refresh token expired|refresh token invalid|malformed token|revoked token/i.test(
        error.message ?? "",
      ),
    ),
  )

/**
 * Execute an authenticated AxonHub admin GraphQL request with one auth retry.
 */
export async function graphqlRequest<T>(
  config: AxonHubConfig,
  query: string,
  variables?: Record<string, unknown>,
  options?: { retryAuth?: boolean },
): Promise<T> {
  const baseUrl = normalizeBaseUrl(config.baseUrl)
  const retryAuth = options?.retryAuth ?? true
  const token = await getSessionToken(config)

  const execute = async (sessionToken: string) => {
    const response = await fetch(`${baseUrl}/admin/graphql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({ query, variables }),
    })

    const payload = (await response
      .json()
      .catch(() => ({}))) as GraphQLResponse<T>
    if (!response.ok || payload.errors?.length) {
      if (retryAuth && isUnauthorized(response, payload.errors)) {
        return null
      }

      const message =
        payload.errors
          ?.map((error) => error.message)
          .filter(Boolean)
          .join("; ") ||
        `AxonHub GraphQL request failed with HTTP ${response.status}`
      throw new Error(message)
    }

    if (!payload.data) {
      throw new Error("AxonHub GraphQL response did not include data")
    }

    return payload.data
  }

  try {
    const firstAttempt = await execute(token)
    if (firstAttempt) return firstAttempt

    // Cached admin JWTs are session-scoped and may expire while the extension
    // page remains open; retry once with fresh credentials before surfacing.
    const refreshedToken = await getSessionToken(config, true)
    const secondAttempt = await execute(refreshedToken)
    if (!secondAttempt) {
      throw new Error("AxonHub session is unauthorized")
    }
    return secondAttempt
  } catch (error) {
    throw new Error(toSafeErrorMessage(error, "AxonHub GraphQL request failed"))
  }
}

/**
 * Convert an AxonHub GraphQL channel into the managed-site channel row shape.
 */
export function axonHubChannelToManagedSite(channel: AxonHubChannel) {
  const models = normalizeList([
    ...(channel.supportedModels ?? []),
    ...(channel.manualModels ?? []),
  ])
  const modelMapping =
    channel.settings?.modelMappings && channel.settings.modelMappings.length > 0
      ? JSON.stringify(
          channel.settings.modelMappings.reduce<Record<string, string>>(
            (acc, mapping) => {
              if (mapping.from?.trim() && mapping.to?.trim()) {
                acc[mapping.from.trim()] = mapping.to.trim()
              }
              return acc
            },
            {},
          ),
        )
      : ""
  const credentials = channel.credentials ?? {}
  const apiKey =
    credentials.apiKeys
      ?.map((key) => key.trim())
      .find((key) => key.length > 0) ??
    credentials.apiKey?.trim() ??
    ""

  return {
    id: numericIdFromGraphqlId(channel.id),
    name: channel.name,
    type: channel.type,
    base_url: channel.baseURL,
    key: apiKey,
    models: models.join(","),
    status:
      channel.status === AXON_HUB_CHANNEL_STATUS.ENABLED
        ? CHANNEL_STATUS.Enable
        : CHANNEL_STATUS.ManuallyDisabled,
    priority: 0,
    weight: channel.orderingWeight ?? 0,
    group: "",
    model_mapping: modelMapping,
    status_code_mapping: "",
    test_model: channel.defaultTestModel ?? null,
    auto_ban: 0,
    created_time: (() => {
      if (!channel.createdAt) return 0
      const parsed = Date.parse(channel.createdAt)
      return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : 0
    })(),
    test_time: 0,
    response_time: 0,
    balance: 0,
    balance_updated_time: 0,
    used_quota: 0,
    tag: null,
    remark: channel.remark ?? null,
    setting: channel.settings ? JSON.stringify(channel.settings) : "",
    settings: channel.settings ? JSON.stringify(channel.settings) : "",
    openai_organization: null,
    other: "",
    other_info: channel.errorMessage ?? "",
    param_override: null,
    header_override: null,
    channel_info: {
      is_multi_key: false,
      multi_key_size: credentials.apiKeys?.length ?? 0,
      multi_key_status_list: null,
      multi_key_polling_index: 0,
      multi_key_mode: "",
    },
    _axonHubData: channel,
  }
}

/**
 * List all AxonHub channels through the paginated admin GraphQL query.
 */
export async function listChannels(
  config: AxonHubConfig,
): Promise<ManagedSiteChannelListData> {
  const cacheKey = cacheKeyForConfig(config)
  const cachedChannels = channelListCache.get(cacheKey)
  if (cachedChannels && cachedChannels.expiresAt > Date.now()) {
    return cachedChannels.data
  }

  channelListCache.delete(cacheKey)
  const items: ReturnType<typeof axonHubChannelToManagedSite>[] = []
  let after: string | null | undefined
  let total = 0
  let pageCount = 0
  const seenCursors = new Set<string>()

  do {
    if (pageCount >= MAX_LIST_CHANNEL_PAGES) {
      throw new Error("AxonHub returned too many channel-list pages")
    }
    pageCount += 1

    const data = await graphqlRequest<QueryChannelsData>(
      config,
      QUERY_CHANNELS,
      {
        input: {
          first: 100,
          after,
        },
      },
    )

    total = data.queryChannels.totalCount ?? total
    items.push(
      ...data.queryChannels.edges.map((edge) =>
        axonHubChannelToManagedSite(edge.node),
      ),
    )
    const nextCursor = data.queryChannels.pageInfo?.hasNextPage
      ? data.queryChannels.pageInfo.endCursor
      : null
    if (nextCursor) {
      if (seenCursors.has(nextCursor)) {
        throw new Error("AxonHub channel pagination cursor repeated")
      }
      seenCursors.add(nextCursor)
    }
    after = nextCursor
  } while (after)

  const result = {
    items,
    total: total || items.length,
    type_counts: items.reduce<Record<string, number>>((acc, channel) => {
      const key = String(channel.type)
      acc[key] = (acc[key] ?? 0) + 1
      return acc
    }, {}),
  }

  channelListCache.set(cacheKey, {
    data: result,
    expiresAt: Date.now() + CHANNEL_LIST_CACHE_TTL_MS,
  })

  return result
}

/**
 * Search AxonHub channels client-side across display fields.
 */
export async function searchChannels(
  config: AxonHubConfig,
  keyword: string,
): Promise<ManagedSiteChannelListData> {
  const channels = await listChannels(config)
  const normalizedKeyword = keyword.trim().toLowerCase()

  if (!normalizedKeyword) {
    return channels
  }

  const items = channels.items.filter((channel) =>
    [
      channel.name,
      channel.base_url,
      channel.models,
      channel.key,
      String(channel.type),
    ].some((value) => value?.toLowerCase().includes(normalizedKeyword)),
  )

  return {
    items,
    total: items.length,
    type_counts: channels.type_counts,
  }
}

/**
 * Create a channel through AxonHub admin GraphQL.
 */
export async function createAxonHubChannel(
  config: AxonHubConfig,
  input: AxonHubCreateChannelInput,
) {
  const data = await graphqlRequest<{ createChannel: AxonHubChannel }>(
    config,
    CREATE_CHANNEL,
    { input },
  )
  invalidateChannelListCache(config)
  return data.createChannel
}

/**
 * Update a channel through AxonHub admin GraphQL.
 */
export async function updateAxonHubChannel(
  config: AxonHubConfig,
  id: string,
  input: AxonHubUpdateChannelInput,
) {
  const data = await graphqlRequest<{ updateChannel: AxonHubChannel }>(
    config,
    UPDATE_CHANNEL,
    { id, input },
  )
  invalidateChannelListCache(config)
  return data.updateChannel
}

/**
 * Update an AxonHub channel status independently from editable fields.
 */
export async function updateAxonHubChannelStatus(
  config: AxonHubConfig,
  id: string,
  status: string,
) {
  const data = await graphqlRequest<{ updateChannelStatus: AxonHubChannel }>(
    config,
    UPDATE_CHANNEL_STATUS,
    { id, status },
  )
  invalidateChannelListCache(config)
  return data.updateChannelStatus
}

/**
 * Delete an AxonHub channel by GraphQL id.
 */
export async function deleteAxonHubChannel(config: AxonHubConfig, id: string) {
  const data = await graphqlRequest<{ deleteChannel: boolean }>(
    config,
    DELETE_CHANNEL,
    { id },
  )
  invalidateChannelListCache(config)
  return data.deleteChannel
}

/**
 * API-service adapter for model-sync channel listing.
 */
export async function listAllChannels(
  request: ApiServiceRequest,
): Promise<ManagedSiteChannelListData> {
  return listChannels(extractRequestConfig(request))
}

/**
 * API-service adapter for channel search.
 */
export async function searchChannel(
  request: ApiServiceRequest,
  keyword: string,
): Promise<ManagedSiteChannelListData | null> {
  return searchChannels(extractRequestConfig(request), keyword)
}

/**
 * API-service adapter for channel creation.
 */
export async function createChannel(
  request: ApiServiceRequest,
  channelData: {
    channel: AxonHubCreateChannelInput & { status?: number }
  },
): Promise<ApiResponse<unknown>> {
  try {
    const config = extractRequestConfig(request)
    const { status, ...input } = channelData.channel
    const created = await createAxonHubChannel(config, input)
    if (status === CHANNEL_STATUS.Enable) {
      await updateAxonHubChannelStatus(
        config,
        created.id,
        AXON_HUB_CHANNEL_STATUS.ENABLED,
      )
    }

    return { success: true, data: created, message: "success" }
  } catch (error) {
    logger.error("Failed to create AxonHub channel", error)
    return {
      success: false,
      data: null,
      message: toSafeErrorMessage(error, "Failed to create AxonHub channel"),
    }
  }
}

/**
 * API-service adapter for channel updates.
 */
export async function updateChannel(
  request: ApiServiceRequest,
  channelData: AxonHubUpdateChannelInput & { id: number; status?: number },
): Promise<ApiResponse<unknown>> {
  try {
    const config = extractRequestConfig(request)
    const { id, status, ...input } = channelData
    const graphqlId = resolveAxonHubGraphqlId(id)
    const updated = await updateAxonHubChannel(config, graphqlId, input)

    if (status !== undefined) {
      await updateAxonHubChannelStatus(
        config,
        graphqlId,
        status === CHANNEL_STATUS.Enable
          ? AXON_HUB_CHANNEL_STATUS.ENABLED
          : AXON_HUB_CHANNEL_STATUS.DISABLED,
      )
    }

    return { success: true, data: updated, message: "success" }
  } catch (error) {
    logger.error("Failed to update AxonHub channel", error)
    return {
      success: false,
      data: null,
      message: toSafeErrorMessage(error, "Failed to update AxonHub channel"),
    }
  }
}

/**
 * API-service adapter for channel deletion.
 */
export async function deleteChannel(
  request: ApiServiceRequest,
  channelId: number,
): Promise<ApiResponse<unknown>> {
  try {
    const deleted = await deleteAxonHubChannel(
      extractRequestConfig(request),
      resolveAxonHubGraphqlId(channelId),
    )

    return {
      success: deleted,
      data: deleted,
      message: deleted ? "success" : "Failed to delete AxonHub channel",
    }
  } catch (error) {
    logger.error("Failed to delete AxonHub channel", error)
    return {
      success: false,
      data: null,
      message: toSafeErrorMessage(error, "Failed to delete AxonHub channel"),
    }
  }
}

/**
 * Return no groups because AxonHub does not expose New API group semantics.
 */
export async function fetchSiteUserGroups(): Promise<string[]> {
  return []
}
