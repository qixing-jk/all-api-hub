/**
 * Octopus API 服务
 * 提供与 Octopus 后端的所有 API 交互
 */
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { userPreferences } from "~/services/preferences/userPreferences"
import type {
  OctopusApiResponse,
  OctopusChannel,
  OctopusCreateChannelRequest,
  OctopusFetchModelRequest,
  OctopusUpdateChannelRequest,
} from "~/types/octopus"
import type { OctopusConfig } from "~/types/octopusConfig"
import { createLogger } from "~/utils/core/logger"
import { normalizeBaseUrl } from "~/utils/core/url"

import { octopusAuthManager } from "./auth"
import { buildOctopusAuthHeaders } from "./utils"

const logger = createLogger("OctopusAPI")

export class OctopusMutationApiError extends Error {
  constructor(
    message: string,
    readonly evidence: {
      dispatch: "not-dispatched" | "dispatched"
      responseReceived: boolean
      confirmedNonApplication: boolean
      raw: unknown
      statusCode?: number
      code?: string | number
    },
  ) {
    super(message)
    this.name = "OctopusMutationApiError"
  }

  get dispatch() {
    return this.evidence.dispatch
  }

  get responseReceived() {
    return this.evidence.responseReceived
  }

  get confirmedNonApplication() {
    return this.evidence.confirmedNonApplication
  }

  get raw() {
    return this.evidence.raw
  }

  get statusCode() {
    return this.evidence.statusCode
  }

  get code() {
    return this.evidence.code
  }
}

const getOctopusErrorCode = (error: unknown) => {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined
  }
  const code = error.code
  return typeof code === "string" ||
    (typeof code === "number" && Number.isSafeInteger(code))
    ? code
    : undefined
}

const getOctopusMutationErrorMessage = (error: unknown) =>
  error instanceof Error && error.message
    ? error.message
    : "Octopus mutation failed"

/**
 * 执行 Octopus API 请求
 */
async function fetchOctopusApi<T>(
  config: OctopusConfig,
  endpoint: string,
  options: RequestInit = {},
  requestKind: "read" | "mutation" = "read",
): Promise<OctopusApiResponse<T>> {
  const signal = options.signal ?? undefined
  const isMutation = requestKind === "mutation"
  let fetchStarted = false
  let responseReceived = false
  let responseStatus: number | undefined

  try {
    const token = await octopusAuthManager.getValidToken(config, {
      signal,
    })
    const baseUrl = normalizeBaseUrl(config.baseUrl)
    const url = `${baseUrl}${endpoint}`

    if (isMutation && signal?.aborted) {
      const raw =
        signal.reason ??
        new DOMException("The operation was aborted", "AbortError")
      throw new OctopusMutationApiError(getOctopusMutationErrorMessage(raw), {
        dispatch: "not-dispatched",
        responseReceived: false,
        confirmedNonApplication: true,
        raw,
        code: getOctopusErrorCode(raw),
      })
    }

    fetchStarted = true
    const response = await fetch(url, {
      ...options,
      signal,
      headers: createOctopusRequestHeaders(token, options.headers),
    })
    responseReceived = true
    responseStatus = response.status

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
      const message = (responseData.message as string) || "API request failed"
      if (isMutation) {
        throw new OctopusMutationApiError(message, {
          dispatch: "dispatched",
          responseReceived: true,
          confirmedNonApplication: true,
          raw: data,
          statusCode: response.status,
          code: getOctopusErrorCode(data),
        })
      }
      throw new Error(message)
    }

    return {
      success: true,
      data: (responseData.data as T | undefined) ?? null,
      message: (responseData.message as string) || "success",
    }
  } catch (error) {
    if (!isMutation || error instanceof OctopusMutationApiError) {
      throw error
    }
    throw new OctopusMutationApiError(getOctopusMutationErrorMessage(error), {
      dispatch: fetchStarted ? "dispatched" : "not-dispatched",
      responseReceived,
      confirmedNonApplication: !fetchStarted,
      raw: error,
      ...(responseStatus === undefined ? {} : { statusCode: responseStatus }),
      code: getOctopusErrorCode(error),
    })
  }
}

/**
 * 获取渠道列表
 */
export async function listChannels(
  config: OctopusConfig,
  options?: Pick<RequestInit, "signal">,
): Promise<OctopusChannel[]> {
  try {
    const result = await fetchOctopusApi<OctopusChannel[]>(
      config,
      "/api/v1/channel/list",
      options,
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
      ch.base_urls?.some((u) => u.url?.toLowerCase().includes(lowerKeyword)),
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
      "mutation",
    )
    logger.info("Channel created", { name: data.name })
    return result
  } catch (error) {
    logger.error("Failed to create channel")
    throw error
  }
}

/**
 * 更新渠道
 */
export async function updateChannel(
  config: OctopusConfig,
  data: OctopusUpdateChannelRequest,
  options?: Pick<RequestInit, "signal">,
): Promise<OctopusApiResponse<OctopusChannel>> {
  try {
    const result = await fetchOctopusApi<OctopusChannel>(
      config,
      "/api/v1/channel/update",
      {
        method: "POST",
        body: JSON.stringify(data),
        signal: options?.signal,
      },
      "mutation",
    )
    logger.info("Channel updated", { id: data.id })
    return result
  } catch (error) {
    logger.error("Failed to update channel")
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
      "mutation",
    )
    logger.info("Channel deleted", { id: channelId })
    return result
  } catch (error) {
    logger.error("Failed to delete channel")
    throw error
  }
}

/**
 * 获取上游模型列表
 */
export async function fetchRemoteModels(
  config: OctopusConfig,
  channelData: OctopusFetchModelRequest,
  options?: Pick<RequestInit, "signal">,
): Promise<string[]> {
  try {
    const result = await fetchOctopusApi<string[]>(
      config,
      "/api/v1/channel/fetch-model",
      {
        method: "POST",
        body: JSON.stringify(channelData),
        signal: options?.signal,
      },
    )
    return result.data || []
  } catch (error) {
    logger.error("Failed to fetch remote models", error)
    throw error
  }
}

/**
 * Octopus LLMInfo 类型（模型价格信息）
 */
interface OctopusLLMInfo {
  name: string
  input: number
  output: number
  cache_read: number
  cache_write: number
}

/**
 * Octopus Group 类型（分组信息）
 */
interface OctopusGroup {
  id: number
  name: string
  mode: number
  match_regex: string
  first_token_time_out: number
  items: Array<{
    id: number
    group_id: number
    channel_id: number
    model_name: string
    priority: number
    weight: number
  }>
}

/**
 * 获取可用模型列表
 * 调用 Octopus 的 /api/v1/model/list 端点，返回模型名称数组
 */
export async function fetchAvailableModels(
  config: OctopusConfig,
): Promise<string[]> {
  try {
    const result = await fetchOctopusApi<OctopusLLMInfo[]>(
      config,
      "/api/v1/model/list",
    )
    return (result.data || []).map((model) => model.name)
  } catch (error) {
    logger.error("Failed to fetch available models", error)
    throw error
  }
}

/**
 * 获取分组列表
 * 调用 Octopus 的 /api/v1/group/list 端点，返回分组名称数组
 */
export async function fetchGroups(config: OctopusConfig): Promise<string[]> {
  try {
    const result = await fetchOctopusApi<OctopusGroup[]>(
      config,
      "/api/v1/group/list",
    )
    return (result.data || []).map((group) => group.name)
  } catch (error) {
    logger.error("Failed to fetch groups", error)
    throw error
  }
}

export { octopusAuthManager } from "./auth"

const createOctopusRequestHeaders = (
  token: string,
  headers?: HeadersInit,
): Headers => {
  const requestHeaders = new Headers(buildOctopusAuthHeaders(token))
  const overrideHeaders = new Headers(headers)
  for (const [name, value] of overrideHeaders.entries()) {
    requestHeaders.set(name, value)
  }
  return requestHeaders
}

const getStoredOctopusConfig = async (): Promise<OctopusConfig | null> => {
  const octopusConfig = (await userPreferences.getPreferences())?.octopus
  if (
    !octopusConfig?.baseUrl ||
    !octopusConfig?.username ||
    !octopusConfig?.password
  ) {
    return null
  }
  return {
    baseUrl: octopusConfig.baseUrl,
    username: octopusConfig.username,
    password: octopusConfig.password,
  }
}

/**
 * 获取站点分组列表（符合 common API 签名）
 * 使用 Octopus JWT 认证调用 /api/v1/group/list
 * 注意：忽略 request 中的 auth 参数，使用 Octopus 配置中的凭据
 */
export async function fetchSiteUserGroups(
  _request: ApiServiceRequest,
): Promise<string[]> {
  try {
    const octopusConfig = await getStoredOctopusConfig()
    if (!octopusConfig) {
      logger.warn("Octopus config not available, returning empty groups")
      return []
    }
    return await fetchGroups(octopusConfig)
  } catch (error) {
    logger.error("Failed to fetch site user groups", error)
    return []
  }
}

/**
 * 获取账号可用模型列表（符合 common API 签名）
 * 使用 Octopus JWT 认证调用 /api/v1/model/list
 * 注意：忽略 request 中的 auth 参数，使用 Octopus 配置中的凭据
 */
export async function fetchAccountAvailableModels(
  _request: ApiServiceRequest,
): Promise<string[]> {
  try {
    const octopusConfig = await getStoredOctopusConfig()
    if (!octopusConfig) {
      logger.warn("Octopus config not available, returning empty models")
      return []
    }
    return await fetchAvailableModels(octopusConfig)
  } catch (error) {
    logger.error("Failed to fetch account available models", error)
    return []
  }
}
