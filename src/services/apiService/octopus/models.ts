import { OCTOPUS_API_OPERATIONS } from "~/services/apiService/octopus/operations"
import { type OctopusRequestInit } from "~/services/apiService/octopus/requestContext"
import { fetchOctopusApi } from "~/services/apiService/octopus/requestExecution"
import { type OctopusFetchModelInput } from "~/types/octopus"
import type { OctopusConfig } from "~/types/octopusConfig"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("OctopusAPI")

/**
 * 获取上游模型列表
 */
export async function fetchRemoteModels(
  config: OctopusConfig,
  channelData: OctopusFetchModelInput,
  options?: Pick<OctopusRequestInit, "signal" | "protectionBypassExecution">,
): Promise<string[]> {
  try {
    const result = await fetchOctopusApi<string[]>(
      config,
      {
        kind: OCTOPUS_API_OPERATIONS.FetchRemoteModels,
        input: channelData,
      },
      {
        signal: options?.signal,
        protectionBypassExecution: options?.protectionBypassExecution,
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
    const result = await fetchOctopusApi<OctopusLLMInfo[]>(config, {
      kind: OCTOPUS_API_OPERATIONS.ListAvailableModels,
    })
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
    const result = await fetchOctopusApi<OctopusGroup[]>(config, {
      kind: OCTOPUS_API_OPERATIONS.ListGroups,
    })
    return (result.data || []).map((group) => group.name)
  } catch (error) {
    logger.error("Failed to fetch groups", error)
    throw error
  }
}
