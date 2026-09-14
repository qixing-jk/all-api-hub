/**
 * Octopus configuration validation and managed-channel draft preparation.
 */
import { DEFAULT_OCTOPUS_CHANNEL_FIELDS } from "~/constants/octopus"
import { SITE_TYPES } from "~/constants/siteType"
import type { ManagedSiteChannelDraftRequestOptions } from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import { usesChannelProtocolPaths } from "~/services/apiService/octopus"
import { getManagedSiteRuntimeConfigForType } from "~/services/managedSites/runtimeConfig"
import { fetchManagedSiteImportModels } from "~/services/managedSites/utils/fetchManagedSiteImportModels"
import {
  userPreferences,
  type UserPreferences,
} from "~/services/preferences/userPreferences"
import type {
  ManagedSiteChannelDraft,
  ManagedSiteChannelDraftSource,
} from "~/types/managedSiteChannelDraft"
import { OctopusOutboundType } from "~/types/octopus"
import { createLogger } from "~/utils/core/logger"
import { normalizeList } from "~/utils/core/string"

const logger = createLogger("OctopusService")

/** Builds an imported channel URL for the detected Octopus protocol contract. */
export function buildOctopusBaseUrl(
  baseUrl: string,
  options?: { protocolPaths: boolean; type?: OctopusOutboundType },
): string {
  if (options?.protocolPaths) {
    // v0.13 appends its own /v1 protocol paths. Preserve custom prefixes and
    // Volcengine's version root, whose protocol paths are unversioned.
    // https://github.com/bestruirui/octopus/blob/v0.13.4/internal/server/handlers/channel.go
    const url = new URL(baseUrl.trim())
    url.pathname = url.pathname.replace(/\/+$/, "")
    if (options.type !== OctopusOutboundType.Volcengine) {
      url.pathname = url.pathname.replace(/\/v1$/, "")
    }
    return url.toString().replace(/\/$/, "")
  }

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
  options?: ManagedSiteChannelDraftRequestOptions,
): Promise<ManagedSiteChannelDraft> {
  options?.signal?.throwIfAborted()
  const runtime = await getManagedSiteRuntimeConfigForType(SITE_TYPES.OCTOPUS)
  options?.signal?.throwIfAborted()
  if (!runtime) throw new Error("Octopus configuration is missing")
  const protocolPaths = await usesChannelProtocolPaths(runtime.config, options)
  options?.signal?.throwIfAborted()
  const { models: availableModels, fetchFailed } =
    await fetchManagedSiteImportModels(source, options)
  options?.signal?.throwIfAborted()

  return {
    name: source.name,
    type: DEFAULT_OCTOPUS_CHANNEL_FIELDS.type,
    key: source.apiKey,
    base_url: buildOctopusBaseUrl(source.baseUrl, { protocolPaths }),
    models: normalizeList(availableModels),
    ...(fetchFailed ? { modelPrefillFetchFailed: true } : {}),
    groups: ["default"],
    enabled: true,
  }
}
