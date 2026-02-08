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
import { normalizeBaseUrl } from "~/utils/url"

import { octopusAuthManager } from "./auth"
import { buildOctopusAuthHeaders } from "./utils"

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

  // 检查 HTTP 状态码，处理非成功响应
  if (!response.ok) {
    const contentType = response.headers.get("Content-Type") || ""
    let errorMessage: string

    // Read body once as text, then try to parse as JSON
    const rawBody = await response.text()

    if (contentType.includes("application/json")) {
      // 尝试解析 JSON 错误响应
      try {
        const errorData = JSON.parse(rawBody)
        errorMessage =
          errorData.message || errorData.error || JSON.stringify(errorData)
      } catch {
        errorMessage = rawBody
      }
    } else {
      // 非 JSON 响应，使用已读取的文本
      errorMessage = rawBody
    }

    throw new Error(
      `HTTP ${response.status} ${response.statusText}: ${errorMessage}`,
    )
  }

  // 检查 Content-Type 是否为 JSON
  const contentType = response.headers.get("Content-Type") || ""
  if (!contentType.includes("application/json")) {
    const text = await response.text()
    throw new Error(
      `Expected JSON response but got ${contentType || "unknown content type"}: ${text.slice(0, 200)}`,
    )
  }

  let data: unknown
  try {
    data = await response.json()
  } catch {
    throw new Error(`Failed to parse JSON response from ${endpoint}`)
  }

  // Octopus 返回格式: { success: boolean, data?: T, message?: string }
  // 或者 { code: number, message: string, data?: T }
  const responseData = data as Record<string, unknown>
  if (
    responseData.success === false ||
    (responseData.code !== undefined && responseData.code !== 200)
  ) {
    throw new Error((responseData.message as string) || "API request failed")
  }

  return {
    success: true,
    data: (responseData.data as T | undefined) ?? null,
    message: (responseData.message as string) || "success",
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

// 重新导出认证管理器
export { octopusAuthManager } from "./auth"
