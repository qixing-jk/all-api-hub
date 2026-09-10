/**
 * Octopus configuration validation and managed-channel draft preparation.
 */
import { DEFAULT_OCTOPUS_CHANNEL_FIELDS } from "~/constants/octopus"
import { fetchManagedSiteImportModels } from "~/services/managedSites/utils/fetchManagedSiteImportModels"
import {
  userPreferences,
  type UserPreferences,
} from "~/services/preferences/userPreferences"
import type {
  ManagedSiteChannelDraft,
  ManagedSiteChannelDraftSource,
} from "~/types/managedSiteChannelDraft"
import { createLogger } from "~/utils/core/logger"
import { normalizeList } from "~/utils/core/string"

const logger = createLogger("OctopusService")

/**
 * 为 Octopus 渠道构建 base URL
 * Octopus 的 URL 规则需要添加 /v1 后缀
 */
export function buildOctopusBaseUrl(baseUrl: string): string {
  let url = baseUrl.trim()
  // 移除尾部斜杠
  while (url.endsWith("/")) {
    url = url.slice(0, -1)
  }
  // 如果已经以 /v1 结尾，不再添加
  if (url.endsWith("/v1")) {
    return url
  }
  // 添加 /v1 后缀
  return `${url}/v1`
}

/**
 * 检查偏好设置中是否有有效的 Octopus 配置
 */
function hasValidOctopusConfig(prefs: UserPreferences | null): boolean {
  if (!prefs?.octopus) return false
  const { baseUrl, username, password } = prefs.octopus
  return Boolean(baseUrl?.trim() && username?.trim() && password?.trim())
}

/**
 * 验证 Octopus 配置
 */
export async function checkValidOctopusConfig(): Promise<boolean> {
  try {
    const prefs = await userPreferences.getPreferences()
    return hasValidOctopusConfig(prefs)
  } catch (error) {
    logger.error("Error checking config", error)
    return false
  }
}

/**
 * 准备渠道表单数据
 */
export async function prepareChannelFormData(
  source: ManagedSiteChannelDraftSource,
): Promise<ManagedSiteChannelDraft> {
  const { models: availableModels, fetchFailed } =
    await fetchManagedSiteImportModels(source)

  return {
    name: source.name,
    type: DEFAULT_OCTOPUS_CHANNEL_FIELDS.type,
    key: source.apiKey,
    base_url: buildOctopusBaseUrl(source.baseUrl), // Octopus 需要 /v1 后缀
    models: normalizeList(availableModels),
    ...(fetchFailed ? { modelPrefillFetchFailed: true } : {}),
    groups: ["default"],
    priority: 0,
    weight: 0,
    enabled: true,
  }
}
