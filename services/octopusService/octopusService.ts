/**
 * Octopus Service
 * 实现 ManagedSiteService 接口，提供 Octopus 站点的渠道管理功能
 */
import { t } from "i18next"
import toast from "react-hot-toast"

import { ChannelType } from "~/constants"
import { DEFAULT_OCTOPUS_CHANNEL_FIELDS } from "~/constants/octopus"
import { OCTOPUS } from "~/constants/siteType"
import type { AccountToken } from "~/entrypoints/options/pages/KeyManagement/type"
import { ensureAccountApiToken } from "~/services/accounts/accountOperations"
import { accountStorage } from "~/services/accounts/accountStorage"
import type { ApiResponse } from "~/services/apiService/common/type"
import * as octopusApi from "~/services/apiService/octopus"
import { fetchOpenAICompatibleModelIds } from "~/services/apiService/openaiCompatible"
import type {
  ManagedSiteConfig,
  ManagedSiteService,
} from "~/services/managedSiteService"
import {
  userPreferences,
  type UserPreferences,
} from "~/services/userPreferences"
import type { ApiToken, DisplaySiteData, SiteAccount } from "~/types"
import type {
  ChannelFormData,
  ChannelMode,
  CreateChannelPayload,
  ManagedSiteChannel,
  ManagedSiteChannelListData,
  OctopusChannelWithData,
  UpdateChannelPayload,
} from "~/types/managedSite"
import { OctopusOutboundType } from "~/types/octopus"
import type {
  OctopusChannel,
  OctopusCreateChannelRequest,
} from "~/types/octopus"
import type { OctopusConfig } from "~/types/octopusConfig"
import { getErrorMessage } from "~/utils/error"
import { createLogger } from "~/utils/logger"
import type { ManagedSiteMessagesKey } from "~/utils/managedSite"
import { normalizeList, parseDelimitedList } from "~/utils/string"

const logger = createLogger("OctopusService")

/**
 * 将 ChannelType (New API 渠道类型 0-55) 映射为 OctopusOutboundType (0-5)
 * Octopus 使用不同的类型枚举来表示协议转换器类型
 * @param channelType - New API 的 ChannelType 值或 OctopusOutboundType 值
 * @param isOctopusType - 如果为 true，表示 channelType 已经是 OctopusOutboundType，直接返回
 * @returns 对应的 OctopusOutboundType 值
 */
function mapChannelTypeToOctopusOutboundType(
  channelType: ChannelType | OctopusOutboundType | number | undefined,
  isOctopusType = false,
): OctopusOutboundType {
  // 如果明确指定是 Octopus 类型，且值在有效范围内，直接返回
  if (isOctopusType && channelType !== undefined) {
    if (
      channelType >= OctopusOutboundType.OpenAIChat &&
      channelType <= OctopusOutboundType.OpenAIEmbedding
    ) {
      return channelType as OctopusOutboundType
    }
    // 无效的 Octopus 类型，回退到默认值
    return DEFAULT_OCTOPUS_CHANNEL_FIELDS.type
  }

  // 对于大于 5 的值，肯定是 ChannelType，需要映射
  // 对于 0-5 范围内的值，如果不是明确的 isOctopusType，则当作 ChannelType 处理
  switch (channelType) {
    // Anthropic 系列 (ChannelType.Anthropic = 14)
    case ChannelType.Anthropic:
      return OctopusOutboundType.Anthropic

    // Gemini 系列 (ChannelType.Gemini = 24, ChannelType.VertexAi = 41)
    case ChannelType.Gemini:
    case ChannelType.VertexAi:
      return OctopusOutboundType.Gemini

    // 火山引擎 (ChannelType.VolcEngine = 45)
    case ChannelType.VolcEngine:
      return OctopusOutboundType.Volcengine

    // 其他所有类型都使用 OpenAI Chat 兼容模式
    // 包括: OpenAI, Azure, Ollama, DeepSeek, Moonshot, OpenRouter, Mistral 等
    // 以及 ChannelType 0-5 范围内的值（Unknown, OpenAI, Midjourney, Azure, Ollama, MidjourneyPlus）
    default:
      return DEFAULT_OCTOPUS_CHANNEL_FIELDS.type
  }
}

/**
 * 为 Octopus 渠道构建 base URL
 * Octopus 的 URL 规则需要添加 /v1 后缀
 */
function buildOctopusBaseUrl(baseUrl: string): string {
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
export function hasValidOctopusConfig(prefs: UserPreferences | null): boolean {
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
 * 获取 Octopus 配置
 */
export async function getOctopusConfig(): Promise<ManagedSiteConfig | null> {
  try {
    const prefs = await userPreferences.getPreferences()
    if (hasValidOctopusConfig(prefs) && prefs.octopus) {
      return {
        baseUrl: prefs.octopus.baseUrl,
        token: "", // Octopus 使用 JWT，token 动态获取
        userId: prefs.octopus.username,
      }
    }
    return null
  } catch (error) {
    logger.error("Error getting config", error)
    return null
  }
}

/**
 * 获取完整的 Octopus 配置（包含密码）
 */
async function getFullOctopusConfig(): Promise<OctopusConfig | null> {
  const prefs = await userPreferences.getPreferences()
  if (hasValidOctopusConfig(prefs) && prefs.octopus) {
    return prefs.octopus
  }
  return null
}

/**
 * 将 Octopus 渠道转换为通用 ManagedSiteChannel 格式
 */
export function octopusChannelToManagedSite(
  channel: OctopusChannel,
): OctopusChannelWithData {
  return {
    id: channel.id,
    name: channel.name,
    type: channel.type,
    base_url: channel.base_urls[0]?.url || "",
    key: channel.keys[0]?.channel_key || "",
    models: channel.model || "",
    status: channel.enabled ? 1 : 2, // 1=启用, 2=禁用
    priority: 0,
    weight: 0,
    group: "",
    model_mapping: "",
    status_code_mapping: "",
    test_model: null,
    auto_ban: 0,
    created_time: 0,
    test_time: 0,
    response_time: 0,
    balance: 0,
    balance_updated_time: 0,
    used_quota: 0,
    tag: null,
    remark: null,
    setting: "",
    settings: "",
    // NewApiChannel 额外字段
    openai_organization: null,
    other: "",
    other_info: "",
    param_override: null,
    header_override: null,
    channel_info: {
      is_multi_key: false,
      multi_key_size: 0,
      multi_key_status_list: null,
      multi_key_polling_index: 0,
      multi_key_mode: "",
    },
    // 存储原始 Octopus 数据以便编辑
    _octopusData: channel,
  }
}

/**
 * 搜索渠道
 */
export async function searchChannel(
  _baseUrl: string,
  _accessToken: string,
  _userId: number | string,
  keyword: string,
): Promise<ManagedSiteChannelListData | null> {
  try {
    const config = await getFullOctopusConfig()
    if (!config) return null

    const channels = await octopusApi.searchChannels(config, keyword)
    return {
      items: channels.map(octopusChannelToManagedSite),
      total: channels.length,
      type_counts: {},
    }
  } catch (error) {
    logger.error("Failed to search channels", error)
    return null
  }
}

/**
 * 创建渠道
 */
export async function createChannel(
  _baseUrl: string,
  _adminToken: string,
  _userId: number | string,
  channelData: CreateChannelPayload,
): Promise<ApiResponse<unknown>> {
  try {
    const config = await getFullOctopusConfig()
    if (!config) {
      return { success: false, data: null, message: "Octopus config not found" }
    }

    const channel = channelData.channel
    const request: OctopusCreateChannelRequest = {
      name: channel.name || "",
      // Octopus 表单使用 OctopusTypeSelector，type 已经是 OctopusOutboundType
      type: mapChannelTypeToOctopusOutboundType(channel.type, true),
      enabled: channel.status === 1,
      base_urls: [{ url: channel.base_url || "" }],
      keys: [{ enabled: true, channel_key: channel.key || "" }],
      model: channel.models,
      auto_sync: true, // 默认启用自动同步
      auto_group: 0,
    }

    const result = await octopusApi.createChannel(config, request)
    return {
      success: result.success,
      data: result.data,
      message: result.message || "success",
    }
  } catch (error) {
    return {
      success: false,
      data: null,
      message: getErrorMessage(error) || "Failed to create channel",
    }
  }
}

/**
 * 更新渠道
 */
export async function updateChannel(
  _baseUrl: string,
  _adminToken: string,
  _userId: number | string,
  channelData: UpdateChannelPayload & { status?: number },
): Promise<ApiResponse<unknown>> {
  try {
    const config = await getFullOctopusConfig()
    if (!config) {
      return { success: false, data: null, message: "Octopus config not found" }
    }

    const result = await octopusApi.updateChannel(config, {
      id: channelData.id,
      name: channelData.name,
      // Octopus 表单使用 OctopusTypeSelector，type 已经是 OctopusOutboundType
      type:
        channelData.type !== undefined
          ? mapChannelTypeToOctopusOutboundType(channelData.type, true)
          : undefined,
      enabled: channelData.status === 1,
      base_urls: channelData.base_url
        ? [{ url: channelData.base_url }]
        : undefined,
      model: channelData.models,
    })

    return {
      success: result.success,
      data: result.data,
      message: result.message || "success",
    }
  } catch (error) {
    return {
      success: false,
      data: null,
      message: getErrorMessage(error) || "Failed to update channel",
    }
  }
}

/**
 * 删除渠道
 */
export async function deleteChannel(
  _baseUrl: string,
  _adminToken: string,
  _userId: number | string,
  channelId: number,
): Promise<ApiResponse<unknown>> {
  try {
    const config = await getFullOctopusConfig()
    if (!config) {
      return { success: false, data: null, message: "Octopus config not found" }
    }

    const result = await octopusApi.deleteChannel(config, channelId)
    return {
      success: result.success,
      data: result.data,
      message: result.message || "success",
    }
  } catch (error) {
    return {
      success: false,
      data: null,
      message: getErrorMessage(error) || "Failed to delete channel",
    }
  }
}

/**
 * 获取可用模型列表
 */
export async function fetchAvailableModels(
  account: DisplaySiteData,
  token: ApiToken,
): Promise<string[]> {
  const candidateSources: string[][] = []

  const tokenModelList = parseDelimitedList(token.models)
  if (tokenModelList.length > 0) {
    candidateSources.push(tokenModelList)
  }

  try {
    const upstreamModels = await fetchOpenAICompatibleModelIds({
      baseUrl: account.baseUrl,
      apiKey: token.key,
    })
    if (upstreamModels?.length > 0) {
      candidateSources.push(upstreamModels)
    }
  } catch (error) {
    logger.warn("Failed to fetch upstream models", error)
  }

  return normalizeList(candidateSources.flat())
}

/**
 * 构建渠道名称
 */
export function buildChannelName(
  account: DisplaySiteData,
  token: ApiToken,
): string {
  let channelName = `${account.name} | ${token.name}`.trim()
  if (!channelName.endsWith("(auto)")) {
    channelName += " (auto)"
  }
  return channelName
}

/**
 * 准备渠道表单数据
 */
export async function prepareChannelFormData(
  account: DisplaySiteData,
  token: ApiToken | AccountToken,
): Promise<ChannelFormData> {
  const availableModels = await fetchOpenAICompatibleModelIds({
    baseUrl: account.baseUrl,
    apiKey: token.key,
  })

  if (!availableModels.length) {
    throw new Error(t("messages:octopus.noAnyModels"))
  }

  return {
    name: buildChannelName(account, token),
    type: DEFAULT_OCTOPUS_CHANNEL_FIELDS.type,
    key: token.key,
    base_url: buildOctopusBaseUrl(account.baseUrl), // Octopus 需要 /v1 后缀
    models: normalizeList(availableModels),
    groups: ["default"],
    priority: 0,
    weight: 0,
    status: 1,
  }
}

/**
 * 构建渠道创建 payload
 */
export function buildChannelPayload(
  formData: ChannelFormData,
  mode: ChannelMode = "single",
): CreateChannelPayload {
  return {
    mode,
    channel: {
      name: formData.name.trim(),
      type: formData.type,
      key: formData.key.trim(),
      base_url: formData.base_url.trim(),
      models: normalizeList(formData.models ?? []).join(","),
      groups: formData.groups || ["default"],
      priority: formData.priority,
      weight: formData.weight,
      status: formData.status,
    },
  }
}

/**
 * 查找匹配的渠道
 */
export async function findMatchingChannel(
  _baseUrl: string,
  _adminToken: string,
  _userId: number | string,
  accountBaseUrl: string,
  models: string[],
  key?: string,
): Promise<ManagedSiteChannel | null> {
  try {
    const config = await getFullOctopusConfig()
    if (!config) return null

    const normalizedDesiredKey = (key ?? "").trim()
    const shouldMatchKey = normalizedDesiredKey.length > 0

    const channels = await octopusApi.listChannels(config)

    // 规范化 accountBaseUrl，与 prepareChannelFormData 保持一致
    const normalizedBase = buildOctopusBaseUrl(accountBaseUrl)

    const match = channels.find((ch) => {
      const chBaseUrl = ch.base_urls[0]?.url || ""
      const chModels = parseDelimitedList(ch.model)
      const matchesBaseAndModels =
        chBaseUrl === normalizedBase &&
        chModels.length === models.length &&
        chModels.every((m) => models.includes(m))

      if (!matchesBaseAndModels) return false
      if (!shouldMatchKey) return true

      const keys = Array.isArray(ch.keys) ? ch.keys : []
      return keys.some(
        (item) => (item.channel_key ?? "").trim() === normalizedDesiredKey,
      )
    })

    return match ? octopusChannelToManagedSite(match) : null
  } catch (error) {
    logger.error("Failed to find matching channel", error)
    return null
  }
}

/**
 * 自动配置到 Octopus
 */
export async function autoConfigToOctopus(
  account: SiteAccount,
  toastId?: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const config = await getFullOctopusConfig()
    if (!config) {
      return { success: false, message: t("messages:octopus.configMissing") }
    }

    const displaySiteData = accountStorage.convertToDisplayData(
      account,
    ) as DisplaySiteData

    const apiToken = await ensureAccountApiToken(
      account,
      displaySiteData,
      toastId,
    )

    toast.loading(t("messages:accountOperations.importingToOctopus"), {
      id: toastId,
    })

    const formData = await prepareChannelFormData(displaySiteData, apiToken)

    // 检查是否已存在
    const existingChannel = await findMatchingChannel(
      config.baseUrl,
      "",
      "",
      displaySiteData.baseUrl,
      formData.models,
      formData.key,
    )

    if (existingChannel) {
      return {
        success: false,
        message: t("messages:octopus.channelExists", {
          channelName: existingChannel.name,
        }),
      }
    }

    const payload = buildChannelPayload(formData)
    const result = await createChannel(config.baseUrl, "", "", payload)

    if (result.success) {
      toast.success(
        t("messages:octopus.importSuccess", { channelName: formData.name }),
        {
          id: toastId,
        },
      )
      return {
        success: true,
        message: t("messages:octopus.importSuccess", {
          channelName: formData.name,
        }),
      }
    }

    throw new Error(result.message)
  } catch (error) {
    const message = getErrorMessage(error) || t("messages:octopus.importFailed")
    toast.error(message, { id: toastId })
    return { success: false, message }
  }
}

/**
 * Octopus ManagedSiteService 实现
 */
export const octopusService: ManagedSiteService = {
  siteType: OCTOPUS,
  messagesKey: "octopus" as ManagedSiteMessagesKey,

  searchChannel,
  createChannel,
  updateChannel,
  deleteChannel,
  checkValidConfig: checkValidOctopusConfig,
  getConfig: getOctopusConfig,
  fetchAvailableModels,
  buildChannelName,
  prepareChannelFormData,
  buildChannelPayload,
  findMatchingChannel,
  autoConfigToManagedSite: autoConfigToOctopus,
}
