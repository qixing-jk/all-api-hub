import type { ManagedSitePaginatedChannelRequestOptions } from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import { REQUEST_CONFIG } from "~/services/apiTransport/constant"
import { ApiError } from "~/services/apiTransport/errors"
import { fetchAllItems } from "~/services/apiTransport/pagination"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type {
  VeloeraChannel,
  VeloeraChannelListData,
  VeloeraChannelRaw,
  VeloeraCreateChannelPayload,
  VeloeraUpdateChannelPayload,
} from "~/types/veloera"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

import { veloeraRequests } from "./request"

export {
  fetchAccountData,
  fetchCheckInStatus,
  fetchSupportCheckIn,
  refreshAccountData,
} from "~/services/apiService/newApiFamily/variants/veloera"

/**
 * Unified logger scoped to Veloera API service calls.
 */
const logger = createLogger("ApiService.Veloera")

const VELOERA_CHANNEL_ENDPOINT = "/api/channel"

const wrapChannelMutationError = (error: unknown, fallback: string) =>
  new ApiError(
    getErrorMessage(error, fallback),
    undefined,
    undefined,
    undefined,
    undefined,
    error,
  )

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
 * Normalize Veloera channel fields while preserving native provider data.
 */
const normalizeChannel = (raw: VeloeraChannelRaw): VeloeraChannel => ({
  ...raw,
  id: toNumberOrZero(raw.id),
  type: raw.type ?? 0,
  key: raw.key ?? "",
  name: raw.name ?? "",
  base_url: raw.base_url ?? "",
  models: raw.models ?? "",
  status: toNumberOrZero(raw.status),
  weight: toNumberOrZero(raw.weight),
  priority: toNumberOrZero(raw.priority),
  group: raw.group ?? "default",
  model_mapping: raw.model_mapping ?? "",
})

/**
 * Create a channel for a Veloera-managed site.
 *
 * Veloera expects a flat channel payload (not wrapped by `{ mode, channel }`).
 * The caller supplies a flat provider-owned payload.
 */
export async function createChannel(
  request: ApiServiceRequest,
  channelData: VeloeraCreateChannelPayload,
): Promise<any> {
  try {
    const payload = { ...channelData, group: channelData.group ?? "" }

    return await veloeraRequests.envelope<void>(request, {
      endpoint: VELOERA_CHANNEL_ENDPOINT,
      options: {
        method: "POST",
        body: JSON.stringify(payload),
      },
    })
  } catch (error) {
    logger.error("Failed to create channel")
    throw wrapChannelMutationError(
      error,
      "创建渠道失败，请检查网络或 Veloera 配置",
    )
  }
}

/**
 * Update a channel for a Veloera-managed site.
 *
 * Veloera expects the update payload to be flat and typically uses `group` instead
 * of `groups`. Native update planning supplies the complete provider payload.
 */
export async function updateChannel(
  request: ApiServiceRequest,
  channelData: VeloeraUpdateChannelPayload,
): Promise<any> {
  try {
    return await veloeraRequests.envelope<void>(request, {
      endpoint: VELOERA_CHANNEL_ENDPOINT,
      options: {
        method: "PUT",
        body: JSON.stringify(channelData),
      },
    })
  } catch (error) {
    logger.error("Failed to update channel")
    throw wrapChannelMutationError(
      error,
      "更新渠道失败，请检查网络或 Veloera 配置",
    )
  }
}

/**
 * Delete a channel from a Veloera-managed site.
 */
export async function deleteChannel(
  request: ApiServiceRequest,
  channelId: number,
) {
  try {
    return await veloeraRequests.envelope<void>(request, {
      endpoint: `${VELOERA_CHANNEL_ENDPOINT}/${channelId}`,
      options: {
        method: "DELETE",
      },
    })
  } catch (error) {
    logger.error("Failed to delete channel")
    throw wrapChannelMutationError(
      error,
      "删除渠道失败，请检查网络或 Veloera 配置",
    )
  }
}

/**
 * List all channels from a Veloera-managed site.
 *
 * Veloera returns a bare channel array inside `data` for `/api/channel/`.
 * This implementation paginates from `p=0` and adapts the response into the
 * provider-owned channel inventory.
 */
export async function listAllChannels(
  request: ApiServiceRequest,
  options?: ManagedSitePaginatedChannelRequestOptions,
): Promise<VeloeraChannelListData> {
  const pageSize = options?.pageSize ?? REQUEST_CONFIG.DEFAULT_PAGE_SIZE
  const beforeRequest = options?.beforeRequest

  const allItems = await fetchAllItems<VeloeraChannel>(
    async (page) => {
      await beforeRequest?.()

      const endpoint = `/api/channel/?p=${page}&page_size=${pageSize}`
      const data = await veloeraRequests.data<unknown>(request, {
        endpoint,
        options: { signal: options?.signal },
      })

      if (!Array.isArray(data)) {
        throw new ApiError("Failed to fetch channels", undefined, endpoint)
      }

      const normalized = (data as VeloeraChannelRaw[]).map(normalizeChannel)
      return {
        items: normalized,
        hasMore: normalized.length >= pageSize,
      }
    },
    {
      pageSize,
      startPage: 0,
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
    // Veloera exposes no authoritative total; completeness comes from the
    // requireComplete page-cap guard above rather than this derived count.
    total: allItems.length,
    type_counts: typeCounts,
  } as VeloeraChannelListData
}

/**
 * Fetch Veloera channel detail, normalizing core fields and retaining native data.
 */
export async function fetchChannel(
  request: ApiServiceRequest,
  channelId: number,
  options?: Pick<RequestInit, "signal">,
): Promise<VeloeraChannel> {
  const endpoint = `${VELOERA_CHANNEL_ENDPOINT}/${channelId}`
  const result = await veloeraRequests.data<unknown>(request, {
    endpoint,
    ...(options?.signal ? { options: { signal: options.signal } } : {}),
  })

  return normalizeChannel(result as VeloeraChannelRaw)
}

/**
 * Fetch raw model list for a Veloera channel.
 *
 * Veloera keeps the New API-compatible fetch_models endpoint for channel
 * model synchronization.
 */
export async function fetchChannelModels(
  request: ApiServiceRequest,
  channelId: number,
  options?: Pick<RequestInit, "signal">,
): Promise<string[]> {
  const endpoint = `${VELOERA_CHANNEL_ENDPOINT}/fetch_models/${channelId}`
  const response = await veloeraRequests.envelope<string[]>(request, {
    endpoint,
    options,
  })

  if (!response.success || !Array.isArray(response.data)) {
    throw new ApiError(
      getErrorMessage(response.message, "Failed to fetch models"),
      undefined,
      endpoint,
    )
  }

  return response.data
}

type VeloeraDraftChannelModelProbe = {
  type: number
  baseUrl: string
  key: string
}

/**
 * Probes models from an unsaved Veloera channel configuration.
 * Veloera accepts `type`, `base_url`, and `key` at this provider-owned route:
 * https://github.com/Veloera/Veloera/blob/6525dfce816beaa270e78f0d8b762e19e54d13b8/controller/channel.go
 */
export async function fetchDraftChannelModels(
  request: ApiServiceRequest,
  draft: VeloeraDraftChannelModelProbe,
  options?: Pick<RequestInit, "signal">,
): Promise<string[]> {
  const endpoint = `${VELOERA_CHANNEL_ENDPOINT}/fetch_models`
  const response = await veloeraRequests.envelope<string[]>(request, {
    endpoint,
    options: {
      method: "POST",
      body: JSON.stringify({
        type: draft.type,
        base_url: draft.baseUrl,
        key: draft.key,
      }),
      signal: options?.signal,
    },
  })

  if (!response.success || !Array.isArray(response.data)) {
    throw new ApiError(
      getErrorMessage(response.message, "Failed to fetch models"),
      undefined,
      endpoint,
    )
  }

  return response.data
}

/**
 * Update the `models` field for a Veloera channel.
 */
export async function updateChannelModels(
  request: ApiServiceRequest,
  channelId: number,
  models: string,
  options?: Pick<RequestInit, "signal">,
): Promise<void> {
  const response = await veloeraRequests.envelope<void>(request, {
    endpoint: VELOERA_CHANNEL_ENDPOINT,
    options: {
      method: "PUT",
      body: JSON.stringify({
        id: channelId,
        models,
      } satisfies VeloeraUpdateChannelPayload),
      signal: options?.signal,
    },
  })

  if (!response.success) {
    throw new ApiError(
      getErrorMessage(response.message, "Failed to update channel"),
      undefined,
      VELOERA_CHANNEL_ENDPOINT,
    )
  }
}

/**
 * Update the `models` and `model_mapping` fields for a Veloera channel.
 */
export async function updateChannelModelMapping(
  request: ApiServiceRequest,
  channelId: number,
  models: string,
  modelMappingJson: string,
  options?: Pick<RequestInit, "signal">,
): Promise<void> {
  const response = await veloeraRequests.envelope<void>(request, {
    endpoint: VELOERA_CHANNEL_ENDPOINT,
    options: {
      method: "PUT",
      body: JSON.stringify({
        id: channelId,
        models,
        model_mapping: modelMappingJson,
      } satisfies VeloeraUpdateChannelPayload),
      signal: options?.signal,
    },
  })

  if (!response.success) {
    throw new ApiError(
      getErrorMessage(response.message, "Failed to update channel mapping"),
      undefined,
      VELOERA_CHANNEL_ENDPOINT,
    )
  }
}
