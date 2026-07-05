import { REQUEST_CONFIG } from "~/services/apiTransport/constant"
import { ApiError } from "~/services/apiTransport/errors"
import { fetchAllItems } from "~/services/apiTransport/pagination"
import { fetchApi, fetchApiData } from "~/services/apiTransport/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { CHANNEL_STATUS } from "~/types/managedSite"
import type {
  CreateChannelPayload,
  ManagedSiteChannel,
  ManagedSiteChannelListData,
  UpdateChannelPayload,
} from "~/types/managedSite"
import { createLogger } from "~/utils/core/logger"

const CHANNEL_API_BASE = "/api/channel/"

const logger = createLogger("NewApiFamilyChannelManagement")

const serializeChannelGroups = <T extends { groups?: string[] }>(
  payload: T,
) => {
  if (!payload.groups) {
    return payload
  }

  const { groups, ...rest } = payload
  return {
    ...rest,
    group: groups.join(","),
  }
}

const serializeUpdateChannelPayload = (payload: UpdateChannelPayload) => {
  const serializedPayload = serializeChannelGroups(payload)
  const { status, ...payloadWithoutStatus } = serializedPayload

  // QuantumNous/new-api omits blank edit keys; sending an empty key can
  // overwrite or reject the secret.
  if (payloadWithoutStatus.key?.trim() !== "") {
    return {
      payload: payloadWithoutStatus,
      status,
    }
  }

  const { key, ...payloadWithoutEmptyKey } = payloadWithoutStatus
  return {
    payload: payloadWithoutEmptyKey,
    status,
  }
}

const updateChannelStatus = async (
  request: ApiServiceRequest,
  channelId: number,
  status: number,
) => {
  // QuantumNous/new-api router/channel-router.go maps manual status changes to
  // POST /api/channel/:id/status and rejects `status` in PUT /api/channel/.
  return await fetchApi<boolean>(
    request,
    {
      endpoint: `${CHANNEL_API_BASE}${channelId}/status`,
      options: {
        method: "POST",
        body: JSON.stringify({ status }),
      },
    },
    false,
  )
}

const isNewApiManualStatus = (status: number) =>
  status === CHANNEL_STATUS.Enable || status === CHANNEL_STATUS.ManuallyDisabled

/**
 * 搜索指定关键词的渠道。
 * @param request ApiServiceRequest（包含 baseUrl + 认证信息）。
 * @param keyword 搜索关键词。
 */
export async function searchChannel(
  request: ApiServiceRequest,
  keyword: string,
): Promise<ManagedSiteChannelListData | null> {
  try {
    return await fetchApiData<ManagedSiteChannelListData>(request, {
      endpoint: `${CHANNEL_API_BASE}search?keyword=${encodeURIComponent(keyword)}`,
    })
  } catch (error) {
    if (error instanceof ApiError) {
      logger.error("API 请求失败", error)
    } else {
      logger.error("搜索渠道失败", error)
    }
    return null
  }
}

/**
 * 创建新渠道。
 * @param request ApiServiceRequest（包含 baseUrl + 认证信息）。
 * @param channelData 渠道数据。
 */
export async function createChannel(
  request: ApiServiceRequest,
  channelData: CreateChannelPayload,
) {
  try {
    const payload = {
      ...channelData,
      channel: serializeChannelGroups(channelData.channel),
    }

    return await fetchApi<void>(request, {
      endpoint: CHANNEL_API_BASE,
      options: {
        method: "POST",
        body: JSON.stringify(payload),
      },
    })
  } catch (error) {
    logger.error("创建渠道失败", error)
    throw new Error("创建渠道失败，请检查网络或 New API 配置。")
  }
}

/**
 * 更新新渠道。
 * @param request ApiServiceRequest（包含 baseUrl + 认证信息）。
 * @param channelData 渠道数据。
 */
export async function updateChannel(
  request: ApiServiceRequest,
  channelData: UpdateChannelPayload,
) {
  try {
    const { payload, status } = serializeUpdateChannelPayload(channelData)

    const updateResponse = await fetchApi<void>(request, {
      endpoint: CHANNEL_API_BASE,
      options: {
        method: "PUT",
        body: JSON.stringify(payload),
      },
    })

    if (
      !updateResponse.success ||
      typeof status !== "number" ||
      !isNewApiManualStatus(status)
    ) {
      return updateResponse
    }

    const statusResponse = await updateChannelStatus(
      request,
      channelData.id,
      status,
    )

    return statusResponse.success ? updateResponse : statusResponse
  } catch (error) {
    logger.error("更新渠道失败", error)
    throw new Error("更新渠道失败，请检查网络或 New API 配置。")
  }
}

/**
 * 删除渠道。
 * @param request ApiServiceRequest（包含 baseUrl + 认证信息）。
 * @param channelId 渠道 ID。
 */
export async function deleteChannel(
  request: ApiServiceRequest,
  channelId: number,
) {
  try {
    return await fetchApi<void>(request, {
      endpoint: `${CHANNEL_API_BASE}${channelId}`,
      options: {
        method: "DELETE",
      },
    })
  } catch (error) {
    logger.error("删除渠道失败", error)
    throw new Error("删除渠道失败，请检查网络或 New API 配置。")
  }
}

type ChannelListAllOptions = {
  pageSize?: number
  beforeRequest?: () => Promise<void>
  endpoint?: string
  pageStart?: number
  signal?: AbortSignal
}

/**
 * Fetch all channels from New API with pagination aggregation.
 *
 * Notes:
 * - Aggregates `type_counts` across pages.
 * - Uses the first page's `total` as the authoritative total when later pages omit it.
 * - Optionally invokes a `beforeRequest` hook (e.g. rate limiter) before each page request.
 * @param request ApiServiceRequest（包含 baseUrl + 认证信息）。
 * @param options Additional pagination options.
 */
export async function listAllChannels(
  request: ApiServiceRequest,
  options?: ChannelListAllOptions,
): Promise<ManagedSiteChannelListData> {
  const pageSize = options?.pageSize ?? REQUEST_CONFIG.DEFAULT_PAGE_SIZE
  const beforeRequest = options?.beforeRequest
  const endpoint = options?.endpoint ?? CHANNEL_API_BASE
  const pageStart = options?.pageStart ?? 1

  let total = 0
  const typeCounts: Record<string, number> = {}

  const items = await fetchAllItems<ManagedSiteChannel>(
    async (page) => {
      const params = new URLSearchParams({
        p: page.toString(),
        page_size: pageSize.toString(),
      })

      await beforeRequest?.()

      const response = await fetchApi<ManagedSiteChannelListData>(
        request,
        {
          endpoint: `${endpoint}?${params.toString()}`,
          options: { signal: options?.signal },
        },
        false,
      )

      if (!response.success || !response.data) {
        throw new ApiError(
          response.message || "Failed to fetch channels",
          undefined,
          endpoint,
        )
      }

      const { data } = response
      if (page === pageStart) {
        total = data.total || data.items.length || 0
        Object.assign(typeCounts, data.type_counts || {})
      } else if (data.type_counts) {
        for (const [key, value] of Object.entries(data.type_counts)) {
          typeCounts[key] = (typeCounts[key] || 0) + value
        }
      }

      return {
        items: data.items || [],
        total: total || 0,
      }
    },
    { pageSize, startPage: pageStart },
  )

  return {
    items,
    total,
    type_counts: typeCounts,
  } as ManagedSiteChannelListData
}

/**
 * Fetch raw model list for a given channel.
 * @param request ApiServiceRequest（包含 baseUrl + 认证信息）。
 * @param channelId Target channel id.
 */
export async function fetchChannelModels(
  request: ApiServiceRequest,
  channelId: number,
  options?: Pick<RequestInit, "signal">,
): Promise<string[]> {
  const response = await fetchApi<string[]>(
    request,
    {
      endpoint: `${CHANNEL_API_BASE}fetch_models/${channelId}`,
      options,
    },
    false,
  )

  if (!response.success || !Array.isArray(response.data)) {
    throw new ApiError(
      response.message || "Failed to fetch models",
      undefined,
      `${CHANNEL_API_BASE}fetch_models/${channelId}`,
    )
  }

  return response.data
}

/**
 * Update the `models` field for a channel.
 * @param request ApiServiceRequest（包含 baseUrl + 认证信息）。
 * @param channelId Channel id.
 * @param models Comma-separated model list.
 */
export async function updateChannelModels(
  request: ApiServiceRequest,
  channelId: number,
  models: string,
  options?: Pick<RequestInit, "signal">,
): Promise<void> {
  const payload: UpdateChannelPayload = {
    id: channelId,
    models,
  }

  const response = await fetchApi<void>(
    request,
    {
      endpoint: CHANNEL_API_BASE,
      options: {
        method: "PUT",
        body: JSON.stringify(payload),
        signal: options?.signal,
      },
    },
    false,
  )

  if (!response.success) {
    throw new ApiError(
      response.message || "Failed to update channel",
      undefined,
    )
  }
}

/**
 * Update the `models` and `model_mapping` fields for a channel.
 * @param request ApiServiceRequest（包含 baseUrl + 认证信息）。
 * @param channelId Channel id.
 * @param models Comma-separated model list.
 * @param modelMappingJson Stringified mapping JSON.
 */
export async function updateChannelModelMapping(
  request: ApiServiceRequest,
  channelId: number,
  models: string,
  modelMappingJson: string,
  options?: Pick<RequestInit, "signal">,
): Promise<void> {
  const payload: UpdateChannelPayload = {
    id: channelId,
    models,
    model_mapping: modelMappingJson,
  }

  const response = await fetchApi<void>(
    request,
    {
      endpoint: CHANNEL_API_BASE,
      options: {
        method: "PUT",
        body: JSON.stringify(payload),
        signal: options?.signal,
      },
    },
    false,
  )

  if (!response.success) {
    throw new ApiError(
      response.message || "Failed to update channel mapping",
      undefined,
    )
  }
}
