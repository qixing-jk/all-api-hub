import type { ManagedSitePaginatedChannelRequestOptions } from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import { REQUEST_CONFIG } from "~/services/apiTransport/constant"
import { ApiError } from "~/services/apiTransport/errors"
import { fetchAllItems } from "~/services/apiTransport/pagination"
import type {
  ApiResponse,
  ApiServiceRequest,
} from "~/services/apiTransport/type"
import type {
  DoneHubChannel,
  DoneHubChannelListData,
  DoneHubChannelRaw,
  DoneHubCreateChannelPayload,
  DoneHubUpdateChannelPayload,
} from "~/types/doneHub"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

import { doneHubRequests } from "./request"

export { fetchCheckInStatus } from "~/services/apiService/newApiFamily/default/accountData"
export {
  fetchAccountData,
  fetchTodayIncome,
  fetchTodayUsage,
  refreshAccountData,
} from "~/services/apiService/newApiFamily/variants/doneHub"

/**
 * Unified logger scoped to DoneHub API helpers.
 */
const logger = createLogger("ApiService.DoneHub")

const DONE_HUB_CHANNEL_ENDPOINT = "/api/channel/"
const DONE_HUB_PROVIDER_MODELS_ENDPOINT = "/api/channel/provider_models_list"
const DONE_HUB_GROUP_ENDPOINT = "/api/group/"

const wrapChannelMutationError = (error: unknown, fallback: string) =>
  new ApiError(
    getErrorMessage(error, fallback),
    undefined,
    undefined,
    undefined,
    undefined,
    error,
  )

type DoneHubDataResult<T> = {
  data?: T[] | null
  page?: number
  size?: number
  total_count?: number
}

type DoneHubUserGroupRaw = { symbol?: string }

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

/** Normalizes the fields consumed by the product while preserving native provider data. */
export const normalizeDoneHubChannel = (
  raw: DoneHubChannelRaw,
): DoneHubChannel => ({
  ...raw,
  id: toNumberOrZero(raw.id),
  type: toNumberOrZero(raw.type),
  name: raw.name ?? "",
  key: raw.key ?? "",
  base_url: raw.base_url ?? "",
  models: raw.models ?? "",
  group: raw.group ?? "default",
  status: toNumberOrZero(raw.status),
  priority: toNumberOrZero(raw.priority),
  weight: toNumberOrZero(raw.weight),
  model_mapping: raw.model_mapping ?? "",
})

type ChannelListAllOptions = ManagedSitePaginatedChannelRequestOptions

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
): Promise<DoneHubChannelListData | null> {
  try {
    const params = new URLSearchParams({
      base_url: keyword,
      page: "1",
      size: REQUEST_CONFIG.DEFAULT_PAGE_SIZE.toString(),
    })

    const endpoint = `${DONE_HUB_CHANNEL_ENDPOINT}?${params.toString()}`
    const result = await doneHubRequests.data<DoneHubDataResult<unknown>>(
      request,
      {
        endpoint,
      },
    )

    if (!Array.isArray(result?.data)) {
      throw new ApiError("Failed to search channels", undefined, endpoint)
    }

    const items = (result.data as DoneHubChannelRaw[]).map(
      normalizeDoneHubChannel,
    )
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
    } as DoneHubChannelListData
  } catch (error) {
    logger.error("Failed to search channels", error)
    return null
  }
}

/**
 * Create a channel for DoneHub-managed sites.
 *
 * DoneHub expects a flat channel payload (not wrapped by `{ mode, channel }`).
 * The caller supplies a flat provider-owned payload.
 */
export async function createChannel(
  request: ApiServiceRequest,
  channelData: DoneHubCreateChannelPayload,
) {
  try {
    const payload = {
      ...channelData,
      group: channelData.group ?? "",
      // Must set default {} for model_mapping to prevent DoneHub from treating it as null, which causes multiple unrelated fields in the edit view to appear empty in the UI.
      model_mapping: channelData.model_mapping ?? "{}",
    }

    return await doneHubRequests.envelope<void>(request, {
      endpoint: DONE_HUB_CHANNEL_ENDPOINT,
      options: {
        method: "POST",
        body: JSON.stringify(payload),
      },
    })
  } catch (error) {
    logger.error("Failed to create channel")
    throw wrapChannelMutationError(
      error,
      "创建渠道失败，请检查网络或 Done Hub 配置。",
    )
  }
}

/**
 * Update a channel for DoneHub-managed sites.
 *
 * DoneHub expects the update payload to be flat and uses `group` instead of
 * `groups`. Preserve the native full or selective update exactly as planned.
 */
export async function updateChannel<
  TChannel extends DoneHubUpdateChannelPayload,
>(request: ApiServiceRequest, channelData: TChannel) {
  try {
    return await doneHubRequests.envelope<void>(request, {
      endpoint: DONE_HUB_CHANNEL_ENDPOINT,
      options: {
        method: "PUT",
        body: JSON.stringify(channelData),
      },
    })
  } catch (error) {
    logger.error("Failed to update channel")
    throw wrapChannelMutationError(
      error,
      "更新渠道失败，请检查网络或 Done Hub 配置。",
    )
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
    return await doneHubRequests.envelope<void>(request, {
      endpoint: `${DONE_HUB_CHANNEL_ENDPOINT}${channelId}`,
      options: {
        method: "DELETE",
      },
    })
  } catch (error) {
    logger.error("Failed to delete channel")
    throw wrapChannelMutationError(
      error,
      "删除渠道失败，请检查网络或 Done Hub 配置。",
    )
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
): Promise<DoneHubChannelListData> {
  const pageSize = options?.pageSize ?? REQUEST_CONFIG.DEFAULT_PAGE_SIZE
  const beforeRequest = options?.beforeRequest
  const endpointBase = options?.endpoint ?? DONE_HUB_CHANNEL_ENDPOINT
  const pageStart = options?.pageStart ?? 1

  let totalCount = 0

  const allItems = await fetchAllItems<DoneHubChannel>(
    async (page) => {
      const params = new URLSearchParams({
        page: page.toString(),
        size: pageSize.toString(),
      })

      await beforeRequest?.()

      const endpoint = `${endpointBase}?${params.toString()}`
      const result = await doneHubRequests.data<DoneHubDataResult<unknown>>(
        request,
        {
          endpoint,
          options: { signal: options?.signal },
        },
      )

      if (page === pageStart) {
        totalCount =
          typeof result?.total_count === "number"
            ? result.total_count
            : Array.isArray(result?.data)
              ? result.data.length
              : 0
      }

      const items = Array.isArray(result?.data)
        ? (result.data as DoneHubChannelRaw[]).map(normalizeDoneHubChannel)
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
      requireComplete: options?.requireCompleteInventory,
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
  } as DoneHubChannelListData
}

/**
 * Fetch a single DoneHub channel detail payload without normalizing away
 * DoneHub-native fields needed for full-object update requests.
 */
export async function fetchChannelRaw(
  request: ApiServiceRequest,
  channelId: number,
  options?: Pick<RequestInit, "signal">,
): Promise<DoneHubChannelRaw> {
  const endpoint = `${DONE_HUB_CHANNEL_ENDPOINT}${channelId}`
  const result = await doneHubRequests.data<unknown>(request, {
    endpoint,
    options,
  })

  return result as DoneHubChannelRaw
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
  options?: Pick<RequestInit, "signal">,
): Promise<string[]> {
  const channel = normalizeDoneHubChannel(
    await fetchChannelRaw(request, channelId, options),
  )

  return await fetchDoneHubProviderModels(request, channel, options)
}

const fetchDoneHubProviderModels = async (
  request: ApiServiceRequest,
  channel: DoneHubChannelRaw,
  options?: Pick<RequestInit, "signal">,
): Promise<string[]> => {
  const requestData = {
    ...channel,
    // Keep request payload minimal and aligned with DoneHub's admin UI call.
    models: "",
    model_mapping: "",
    model_headers: "",
  }

  const models = await doneHubRequests.data<unknown>(request, {
    endpoint: DONE_HUB_PROVIDER_MODELS_ENDPOINT,
    options: {
      method: "POST",
      body: JSON.stringify(requestData),
      signal: options?.signal,
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
 * Probes provider models from an unsaved DoneHub channel draft.
 * DoneHub's admin editor sends the draft itself to this endpoint:
 * https://github.com/deanxv/done-hub/blob/1c09e7d75dc170a53d47af1e88c498816a5b85fb/web/src/views/Channel/component/EditModal.jsx
 */
export async function fetchDraftChannelModels(
  request: ApiServiceRequest,
  probe: { type: number; baseUrl: string; key: string },
  options?: Pick<RequestInit, "signal">,
): Promise<string[]> {
  return await fetchDoneHubProviderModels(
    request,
    {
      type: probe.type,
      base_url: probe.baseUrl,
      key: probe.key,
    },
    options,
  )
}

/** Submit one full-object DoneHub channel update without performing a read. */
export async function updateDoneHubChannelFields(
  request: ApiServiceRequest,
  payload: Record<string, unknown>,
  options?: Pick<RequestInit, "signal">,
): Promise<ApiResponse<void>> {
  return await doneHubRequests.envelope<void>(request, {
    endpoint: DONE_HUB_CHANNEL_ENDPOINT,
    options: {
      method: "PUT",
      body: JSON.stringify(payload),
      signal: options?.signal,
    },
  })
}

/**
 * Fetch the complete list of user groups defined on DoneHub.
 *
 * DoneHub returns the complete group array in the envelope `data` field.
 * https://github.com/deanxv/done-hub/blob/1c09e7d75dc170a53d47af1e88c498816a5b85fb/controller/group.go#L19-L37
 */
export async function fetchSiteUserGroups(
  request: ApiServiceRequest,
): Promise<Array<string>> {
  const result = await doneHubRequests.data<unknown>(request, {
    endpoint: DONE_HUB_GROUP_ENDPOINT,
  })
  const allGroups = Array.isArray(result)
    ? (result as DoneHubUserGroupRaw[])
    : []

  const symbols = allGroups
    .map((group) => (group?.symbol ?? "").trim())
    .filter(Boolean)

  return Array.from(new Set(symbols))
}
