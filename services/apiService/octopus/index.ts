/**
 * Octopus API 服务
 * 提供与 Octopus 后端的所有 API 交互
 */
import type {
  OctopusApiResponse,
  OctopusChannel,
  OctopusCreateChannelRequest,
  OctopusFetchModelRequest,
  OctopusUpdateChannelRequest,
} from "~/types/octopus"
import type { OctopusConfig } from "~/types/octopusConfig"
import { createLogger } from "~/utils/logger"

import { octopusAuthManager } from "./auth"
import { buildOctopusAuthHeaders, normalizeBaseUrl } from "./utils"

const logger = createLogger("OctopusAPI")

/**
 * 执行 Octopus API 请求
 */
async function fetchOctopusApi<T>(
  config: OctopusConfig,
  endpoint: string,
  options: RequestInit = {},
): Promise<OctopusApiResponse<T>> {
  const token = await octopusAuthManager.getValidToken(config)
  const baseUrl = normalizeBaseUrl(config.baseUrl)
  const url = `${baseUrl}${endpoint}`

  const response = await fetch(url, {
    ...options,
    headers: {
      ...buildOctopusAuthHeaders(token),
      ...(options.headers || {}),
    },
  })

  const data = await response.json()

  // Octopus 返回格式: { success: boolean, data?: T, message?: string }
  // 或者 { code: number, message: string, data?: T }
  if (data.success === false || (data.code && data.code !== 200)) {
    throw new Error(data.message || "API request failed")
  }

  return {
    success: true,
    data: data.data ?? data,
    message: data.message || "success",
  }
}

/**
 * 获取渠道列表
 */
export async function listChannels(
  config: OctopusConfig,
): Promise<OctopusChannel[]> {
  try {
    const result = await fetchOctopusApi<OctopusChannel[]>(
      config,
      "/api/v1/channel/list",
    )
    return result.data || []
  } catch (error) {
    logger.error("Failed to list channels", error)
    throw error
  }
}

/**
 * 搜索渠道（按名称过滤）
 */
export async function searchChannels(
  config: OctopusConfig,
  keyword: string,
): Promise<OctopusChannel[]> {
  const channels = await listChannels(config)
  if (!keyword) return channels

  const lowerKeyword = keyword.toLowerCase()
  return channels.filter(
    (ch) =>
      ch.name.toLowerCase().includes(lowerKeyword) ||
      ch.base_urls.some((u) => u.url.toLowerCase().includes(lowerKeyword)),
  )
}

/**
 * 创建渠道
 */
export async function createChannel(
  config: OctopusConfig,
  data: OctopusCreateChannelRequest,
): Promise<OctopusApiResponse<OctopusChannel>> {
  try {
    const result = await fetchOctopusApi<OctopusChannel>(
      config,
      "/api/v1/channel/create",
      {
        method: "POST",
        body: JSON.stringify(data),
      },
    )
    logger.info("Channel created", { name: data.name })
    return result
  } catch (error) {
    logger.error("Failed to create channel", error)
    throw error
  }
}

/**
 * 更新渠道
 */
export async function updateChannel(
  config: OctopusConfig,
  data: OctopusUpdateChannelRequest,
): Promise<OctopusApiResponse<OctopusChannel>> {
  try {
    const result = await fetchOctopusApi<OctopusChannel>(
      config,
      "/api/v1/channel/update",
      {
        method: "POST",
        body: JSON.stringify(data),
      },
    )
    logger.info("Channel updated", { id: data.id })
    return result
  } catch (error) {
    logger.error("Failed to update channel", error)
    throw error
  }
}

/**
 * 删除渠道
 */
export async function deleteChannel(
  config: OctopusConfig,
  channelId: number,
): Promise<OctopusApiResponse<null>> {
  try {
    const result = await fetchOctopusApi<null>(
      config,
      `/api/v1/channel/delete/${channelId}`,
      {
        method: "DELETE",
      },
    )
    logger.info("Channel deleted", { id: channelId })
    return result
  } catch (error) {
    logger.error("Failed to delete channel", error)
    throw error
  }
}

/**
 * 启用/禁用渠道
 */
export async function toggleChannelEnabled(
  config: OctopusConfig,
  channelId: number,
  enabled: boolean,
): Promise<OctopusApiResponse<null>> {
  try {
    const result = await fetchOctopusApi<null>(
      config,
      "/api/v1/channel/enable",
      {
        method: "POST",
        body: JSON.stringify({ id: channelId, enabled }),
      },
    )
    logger.info("Channel toggled", { id: channelId, enabled })
    return result
  } catch (error) {
    logger.error("Failed to toggle channel", error)
    throw error
  }
}

/**
 * 获取上游模型列表
 */
export async function fetchRemoteModels(
  config: OctopusConfig,
  channelData: OctopusFetchModelRequest,
): Promise<string[]> {
  try {
    const result = await fetchOctopusApi<string[]>(
      config,
      "/api/v1/channel/fetch-model",
      {
        method: "POST",
        body: JSON.stringify(channelData),
      },
    )
    return result.data || []
  } catch (error) {
    logger.error("Failed to fetch remote models", error)
    throw error
  }
}

/**
 * 触发模型同步
 */
export async function triggerModelSync(
  config: OctopusConfig,
): Promise<OctopusApiResponse<null>> {
  return await fetchOctopusApi<null>(config, "/api/v1/channel/sync", {
    method: "POST",
  })
}

/**
 * 获取上次同步时间
 */
export async function getLastSyncTime(
  config: OctopusConfig,
): Promise<string | null> {
  try {
    const result = await fetchOctopusApi<string>(
      config,
      "/api/v1/channel/last-sync-time",
    )
    return result.data || null
  } catch (error) {
    logger.error("Failed to get last sync time", error)
    return null
  }
}

// 重新导出认证管理器
export { octopusAuthManager } from "./auth"
