import { REQUEST_CONFIG } from "~/services/apiService/common/constant"
import { ApiError } from "~/services/apiService/common/errors"
import { fetchAllItems } from "~/services/apiService/common/pagination"
import type { ApiServiceRequest } from "~/services/apiService/common/type"
import { fetchApi, fetchApiData } from "~/services/apiService/common/utils"
import type {
  CreateChannelPayload,
  ManagedSiteChannel,
  ManagedSiteChannelListData,
  UpdateChannelPayload,
} from "~/types/managedSite"
import { createLogger } from "~/utils/logger"

/**
 * Unified logger scoped to DoneHub API helpers.
 */
const logger = createLogger("ApiService.DoneHub")

const DONE_HUB_CHANNEL_ENDPOINT = "/api/channel/"
const DONE_HUB_PROVIDER_MODELS_ENDPOINT = "/api/channel/provider_models_list"
const DONE_HUB_GROUP_ENDPOINT = "/api/group/"

type DoneHubDataResult<T> = {
  data?: T[] | null
  page?: number
  size?: number
  total_count?: number
}

type DoneHubChannelInfo = Partial<ManagedSiteChannel["channel_info"]>

type DoneHubChannelRaw = Partial<
  Omit<ManagedSiteChannel, "channel_info"> & {
    channel_info?: DoneHubChannelInfo
  }
>

type DoneHubUserGroupRaw = {
  symbol?: string
}

/**
 * Create an empty channel_info object when upstream omits it.
 */
const createDefaultChannelInfo = (): ManagedSiteChannel["channel_info"] => ({
  is_multi_key: false,
  multi_key_size: 0,
  multi_key_status_list: null,
  multi_key_polling_index: 0,
  multi_key_mode: "",
})

/**
 * Best-effort conversion for numeric fields.
 */
const toNumberOrZero = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

/**
 * Normalize DoneHub channel payloads to match New API's `ManagedSiteChannel`.
 */
const normalizeChannel = (raw: DoneHubChannelRaw): ManagedSiteChannel => {
  const rawInfo = raw.channel_info
  const channelInfo = rawInfo
    ? {
        is_multi_key: Boolean(rawInfo.is_multi_key),
        multi_key_size: toNumberOrZero(rawInfo.multi_key_size),
        multi_key_status_list: rawInfo.multi_key_status_list ?? null,
        multi_key_polling_index: toNumberOrZero(
          rawInfo.multi_key_polling_index,
        ),
        multi_key_mode: rawInfo.multi_key_mode ?? "",
      }
    : createDefaultChannelInfo()

  return {
    id: toNumberOrZero(raw.id),
    type: toNumberOrZero(raw.type) as ManagedSiteChannel["type"],
    key: raw.key ?? "",
    name: raw.name ?? "",
    base_url: raw.base_url ?? "",
    models: raw.models ?? "",
    status: toNumberOrZero(raw.status) as ManagedSiteChannel["status"],
    weight: toNumberOrZero(raw.weight),
    priority: toNumberOrZero(raw.priority),
    openai_organization: raw.openai_organization ?? null,
    test_model: raw.test_model ?? null,
    created_time: toNumberOrZero(raw.created_time),
    test_time: toNumberOrZero(raw.test_time),
    response_time: toNumberOrZero(raw.response_time),
    other: raw.other ?? "",
    balance: toNumberOrZero(raw.balance),
    balance_updated_time: toNumberOrZero(raw.balance_updated_time),
    group: raw.group ?? "default",
    used_quota: toNumberOrZero(raw.used_quota),
    model_mapping: raw.model_mapping ?? "",
    status_code_mapping: raw.status_code_mapping ?? "",
    auto_ban: toNumberOrZero(raw.auto_ban),
    other_info: raw.other_info ?? "",
    tag: raw.tag ?? null,
    param_override: raw.param_override ?? null,
    header_override: raw.header_override ?? null,
    remark: raw.remark ?? null,
    channel_info: channelInfo,
    setting: raw.setting ?? "",
    settings: raw.settings ?? raw.setting ?? "",
  }
}

type ChannelListAllOptions = {
  pageSize?: number
  beforeRequest?: () => Promise<void>
  endpoint?: string
  pageStart?: number
}

/**
 * Search channels for DoneHub-managed sites.
 *
 * DoneHub does not expose `/api/channel/search?keyword=...` (New API style).
 * Instead, it supports field-scoped filtering via `GET /api/channel/` query params.
 *
 * We map `keyword` to the DoneHub `base_url` filter since callers (e.g. auto-import)
 * use this to detect existing channels by upstream base URL.
 */
export async function searchChannel(
  request: ApiServiceRequest,
  keyword: string,
): Promise<ManagedSiteChannelListData | null> {
  try {
    const params = new URLSearchParams({
      base_url: keyword,
      page: "1",
      size: REQUEST_CONFIG.DEFAULT_PAGE_SIZE.toString(),
    })

    const endpoint = `${DONE_HUB_CHANNEL_ENDPOINT}?${params.toString()}`
    const result = await fetchApiData<DoneHubDataResult<unknown>>(request, {
      endpoint,
    })

    if (!Array.isArray(result?.data)) {
      throw new ApiError("Failed to search channels", undefined, endpoint)
    }

    const items = (result.data as DoneHubChannelRaw[]).map(normalizeChannel)
    const typeCounts: Record<string, number> = {}
    for (const channel of items) {
      const key = String(channel.type)
      typeCounts[key] = (typeCounts[key] || 0) + 1
    }

    return {
      items,
      total:
        typeof result.total_count === "number"
          ? result.total_count
          : items.length,
      type_counts: typeCounts,
    } as ManagedSiteChannelListData
  } catch (error) {
    logger.error("Failed to search channels", error)
    return null
  }
}

/**
 * Create a channel for DoneHub-managed sites.
 *
 * DoneHub expects a flat channel payload (not wrapped by `{ mode, channel }`).
 * We convert `CreateChannelPayload` into a DoneHub-compatible request body.
 */
export async function createChannel(
  request: ApiServiceRequest,
  channelData: CreateChannelPayload,
) {
  try {
    const { groups, ...channel } = channelData.channel
    const payload = {
      ...channel,
      group: channel.group ?? (groups ?? []).join(","),
      // Must set default {} for model_mapping to prevent DoneHub from treating it as null, which causes multiple unrelated fields in the edit view to appear empty in the UI.
      model_mapping: channel.model_mapping ?? "{}",
    }

    return await fetchApi<void>(request, {
      endpoint: DONE_HUB_CHANNEL_ENDPOINT,
      options: {
        method: "POST",
        body: JSON.stringify(payload),
      },
    })
  } catch (error) {
    logger.error("Failed to create channel", error)
    throw new Error("创建渠道失败，请检查网络或 Done Hub 配置。")
  }
}

/**
 * Update a channel for DoneHub-managed sites.
 *
 * DoneHub expects the update payload to be flat and typically uses `group`
 * instead of `groups`. We ensure `group` is populated and omit `groups`.
 */
export async function updateChannel(
  request: ApiServiceRequest,
  channelData: UpdateChannelPayload,
) {
  try {
    const { groups, ...rest } = channelData
    const payload = {
      ...rest,
      group: rest.group ?? (groups ?? []).join(","),
    }

    return await fetchApi<void>(request, {
      endpoint: DONE_HUB_CHANNEL_ENDPOINT,
      options: {
        method: "PUT",
        body: JSON.stringify(payload),
      },
    })
  } catch (error) {
    logger.error("Failed to update channel", error)
    throw new Error("更新渠道失败，请检查网络或 Done Hub 配置。")
  }
}

/**
 * Delete a channel for DoneHub-managed sites.
 */
export async function deleteChannel(
  request: ApiServiceRequest,
  channelId: number,
) {
  try {
    return await fetchApi<void>(request, {
      endpoint: `${DONE_HUB_CHANNEL_ENDPOINT}${channelId}`,
      options: {
        method: "DELETE",
      },
    })
  } catch (error) {
    logger.error("Failed to delete channel", error)
    throw new Error("删除渠道失败，请检查网络或 Done Hub 配置。")
  }
}

/**
 * List all channels from DoneHub with pagination aggregation.
 *
 * DoneHub uses `page` (1-indexed) and `size` query params and returns a
 * `DataResult` payload: `{ data, page, size, total_count }`.
 */
export async function listAllChannels(
  request: ApiServiceRequest,
  options?: ChannelListAllOptions,
): Promise<ManagedSiteChannelListData> {
  const pageSize = options?.pageSize ?? REQUEST_CONFIG.DEFAULT_PAGE_SIZE
  const beforeRequest = options?.beforeRequest
  const endpointBase = options?.endpoint ?? DONE_HUB_CHANNEL_ENDPOINT
  const pageStart = options?.pageStart ?? 1

  let totalCount = 0

  const allItems = await fetchAllItems<ManagedSiteChannel>(
    async (page) => {
      const params = new URLSearchParams({
        page: page.toString(),
        size: pageSize.toString(),
      })

      await beforeRequest?.()

      const endpoint = `${endpointBase}?${params.toString()}`
      const result = await fetchApiData<DoneHubDataResult<unknown>>(request, {
        endpoint,
      })

      if (page === pageStart) {
        totalCount =
          typeof result?.total_count === "number"
            ? result.total_count
            : Array.isArray(result?.data)
              ? result.data.length
              : 0
      }

      const items = Array.isArray(result?.data)
        ? (result.data as DoneHubChannelRaw[]).map(normalizeChannel)
        : []

      return {
        items,
        total: totalCount,
      }
    },
    {
      pageSize,
      startPage: pageStart,
      maxPages: REQUEST_CONFIG.MAX_PAGES,
    },
  )

  const typeCounts: Record<string, number> = {}
  for (const channel of allItems) {
    const key = String(channel.type)
    typeCounts[key] = (typeCounts[key] || 0) + 1
  }

  return {
    items: allItems,
    total: totalCount || allItems.length,
    type_counts: typeCounts,
  } as ManagedSiteChannelListData
}

/**
 * Fetch the current model list for a given channel.
 *
 * DoneHub does not expose `fetch_models/{id}` (New API style). Instead, the
 * admin UI uses `POST /api/channel/provider_models_list` to fetch the upstream
 * provider model list for a given channel configuration.
 */
export async function fetchChannelModels(
  request: ApiServiceRequest,
  channelId: number,
): Promise<string[]> {
  const channelEndpoint = `${DONE_HUB_CHANNEL_ENDPOINT}${channelId}`
  const channel = await fetchApiData<Record<string, unknown>>(request, {
    endpoint: channelEndpoint,
  })

  const requestData = {
    ...channel,
    // Keep request payload minimal and aligned with DoneHub's admin UI call.
    models: "",
    model_mapping: "",
    model_headers: "",
  }

  const models = await fetchApiData<unknown>(request, {
    endpoint: DONE_HUB_PROVIDER_MODELS_ENDPOINT,
    options: {
      method: "POST",
      body: JSON.stringify(requestData),
    },
  })

  if (!Array.isArray(models)) {
    throw new ApiError(
      "Failed to fetch provider model list",
      undefined,
      DONE_HUB_PROVIDER_MODELS_ENDPOINT,
    )
  }

  return (models as unknown[])
    .map((model) => (typeof model === "string" ? model.trim() : ""))
    .filter(Boolean)
}

/**
 * Update the `models` field for a DoneHub channel.
 *
 * DoneHub's `PUT /api/channel/` uses `Select(\"*\")` when `models != \"\"`, which
 * turns the update into a full overwrite. Sending only `{ id, models }` would
 * wipe other channel fields (key/base_url/proxy/etc). We must fetch the full
 * channel payload first and then submit the complete object with updated models.
 */
export async function updateChannelModels(
  request: ApiServiceRequest,
  channelId: number,
  models: string,
): Promise<void> {
  const channelEndpoint = `${DONE_HUB_CHANNEL_ENDPOINT}${channelId}`
  const channel = await fetchApiData<Record<string, unknown>>(request, {
    endpoint: channelEndpoint,
  })

  const payload = {
    ...channel,
    models,
  }

  const response = await fetchApi<void>(
    request,
    {
      endpoint: DONE_HUB_CHANNEL_ENDPOINT,
      options: {
        method: "PUT",
        body: JSON.stringify(payload),
      },
    },
    false,
  )

  if (!response.success) {
    throw new ApiError(
      response.message || "Failed to update channel models",
      undefined,
      DONE_HUB_CHANNEL_ENDPOINT,
    )
  }
}

/**
 * Update the `models` and `model_mapping` fields for a DoneHub channel.
 *
 * Same overwrite caveat as `updateChannelModels`: we must submit a full channel
 * payload to avoid clearing unrelated fields.
 */
export async function updateChannelModelMapping(
  request: ApiServiceRequest,
  channelId: number,
  models: string,
  modelMappingJson: string,
): Promise<void> {
  const channelEndpoint = `${DONE_HUB_CHANNEL_ENDPOINT}${channelId}`
  const channel = await fetchApiData<Record<string, unknown>>(request, {
    endpoint: channelEndpoint,
  })

  const payload = {
    ...channel,
    models,
    model_mapping: modelMappingJson,
  }

  const response = await fetchApi<void>(
    request,
    {
      endpoint: DONE_HUB_CHANNEL_ENDPOINT,
      options: {
        method: "PUT",
        body: JSON.stringify(payload),
      },
    },
    false,
  )

  if (!response.success) {
    throw new ApiError(
      response.message || "Failed to update channel model mapping",
      undefined,
      DONE_HUB_CHANNEL_ENDPOINT,
    )
  }
}

/**
 * Fetch the complete list of user groups defined on DoneHub.
 *
 * DoneHub returns a paginated `DataResult[UserGroup]` for `GET /api/group/`.
 * We paginate and return the `symbol` fields for admin UI.
 */
export async function fetchSiteUserGroups(
  request: ApiServiceRequest,
): Promise<Array<string>> {
  const pageSize = REQUEST_CONFIG.DEFAULT_PAGE_SIZE

  const allGroups = await fetchAllItems<DoneHubUserGroupRaw>(
    async (page) => {
      const params = new URLSearchParams({
        page: page.toString(),
        size: pageSize.toString(),
      })
      const endpoint = `${DONE_HUB_GROUP_ENDPOINT}?${params.toString()}`
      const result = await fetchApiData<DoneHubDataResult<unknown>>(request, {
        endpoint,
      })

      const items = Array.isArray(result?.data)
        ? (result.data as DoneHubUserGroupRaw[])
        : []
      const total =
        typeof result?.total_count === "number"
          ? result.total_count
          : items.length

      return {
        items,
        total,
      }
    },
    {
      pageSize,
      startPage: 1,
      maxPages: REQUEST_CONFIG.MAX_PAGES,
    },
  )

  const symbols = allGroups
    .map((group) => (group?.symbol ?? "").trim())
    .filter(Boolean)

  return Array.from(new Set(symbols))
}
