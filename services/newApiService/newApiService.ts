import { t } from "i18next"
import toast from "react-hot-toast"

import { DEFAULT_CHANNEL_FIELDS } from "~/constants/managedSite"
import { NEW_API } from "~/constants/siteType"
import { AccountToken } from "~/entrypoints/options/pages/KeyManagement/type"
import { ensureAccountApiToken } from "~/services/accountOperations"
import { accountStorage } from "~/services/accountStorage"
import { getApiService } from "~/services/apiService"
import { fetchUpstreamModelsNameList } from "~/services/apiService/openai"
import { ApiToken, DisplaySiteData, SiteAccount } from "~/types"
import type {
  ChannelFormData,
  ChannelMode,
  CreateChannelPayload,
  ManagedSiteChannel,
  ManagedSiteChannelListData,
  UpdateChannelPayload,
} from "~/types/managedSite"
import type {
  AutoConfigToNewApiResponse,
  ServiceResponse,
} from "~/types/serviceResponse"
import { isArraysEqual } from "~/utils"
import { getErrorMessage } from "~/utils/error"

import { UserPreferences, userPreferences } from "../userPreferences"

/**
 * Parses a comma-delimited string into a trimmed string array, skipping blanks.
 */
function parseDelimitedList(value?: string | null): string[] {
  if (!value) return []
  return value
    .split(/[,]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

/**
 * Normalizes a list of strings by trimming entries and removing duplicates.
 */
function normalizeList(values: string[] = []): string[] {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)))
}

/**
 * 搜索指定关键词的渠道
 * @param baseUrl New API 的基础 URL
 * @param accessToken 管理员令牌
 * @param userId 用户 ID
 * @param keyword 搜索关键词
 */
export async function searchChannel(
  baseUrl: string,
  accessToken: string,
  userId: number | string,
  keyword: string,
): Promise<ManagedSiteChannelListData | null> {
  return await getApiService(NEW_API).searchChannel(
    baseUrl,
    accessToken,
    userId,
    keyword,
  )
}

/**
 * 创建新渠道
 * @param baseUrl New API 的基础 URL
 * @param adminToken 管理员令牌
 * @param userId 用户 ID
 * @param channelData 渠道数据
 */
export async function createChannel(
  baseUrl: string,
  adminToken: string,
  userId: number | string,
  channelData: CreateChannelPayload,
) {
  return await getApiService(NEW_API).createChannel(
    baseUrl,
    adminToken,
    userId,
    channelData,
  )
}

/**
 * 更新新渠道
 * @param baseUrl New API 的基础 URL
 * @param adminToken 管理员令牌
 * @param userId 用户 ID
 * @param channelData 渠道数据
 */
export async function updateChannel(
  baseUrl: string,
  adminToken: string,
  userId: number | string,
  channelData: UpdateChannelPayload,
) {
  return await getApiService(NEW_API).updateChannel(
    baseUrl,
    adminToken,
    userId,
    channelData,
  )
}

/**
 * 删除渠道
 */
export async function deleteChannel(
  baseUrl: string,
  adminToken: string,
  userId: number | string,
  channelId: number,
) {
  return await getApiService(NEW_API).deleteChannel(
    baseUrl,
    adminToken,
    userId,
    channelId,
  )
}

/**
 * Checks whether the given user preferences contain a complete New API config.
 */
export function hasValidNewApiConfig(prefs: UserPreferences | null): boolean {
  if (!prefs) {
    return false
  }

  const { newApi } = prefs

  if (!newApi) {
    return false
  }

  return Boolean(newApi.baseUrl && newApi.adminToken && newApi.userId)
}

/**
 * Validate New API configuration
 */
export async function checkValidNewApiConfig(): Promise<boolean> {
  try {
    const prefs = await userPreferences.getPreferences()
    return hasValidNewApiConfig(prefs)
  } catch (error) {
    console.error("[NewAPI] Error checking config:", error)
    return false
  }
}

/**
 * Get New API configuration from user preferences
 */
export async function getNewApiConfig(): Promise<{
  baseUrl: string
  token: string
  userId: string
} | null> {
  try {
    const prefs = await userPreferences.getPreferences()
    if (hasValidNewApiConfig(prefs)) {
      const { newApi } = prefs
      return {
        baseUrl: newApi.baseUrl,
        token: newApi.adminToken,
        userId: newApi.userId,
      }
    }
    return null
  } catch (error) {
    console.error("[NewAPI] Error getting config:", error)
    return null
  }
}

/**
 * 获取账号支持的模型列表。
 * 优先使用 API 密钥携带的模型列表，回退到上游接口与账号可用模型。
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
    const upstreamModels = await fetchUpstreamModelsNameList({
      baseUrl: account.baseUrl,
      apiKey: token.key,
    })
    if (upstreamModels && upstreamModels.length > 0) {
      candidateSources.push(upstreamModels)
    }
  } catch (error) {
    console.warn("Failed to fetch upstream models:", error)
  }

  try {
    const fallbackModels = await getApiService(
      account.siteType,
    ).fetchAccountAvailableModels(account)
    if (fallbackModels && fallbackModels.length > 0) {
      candidateSources.push(fallbackModels)
    }
  } catch (error) {
    console.warn("Failed to fetch fallback models:", error)
  }

  const merged = candidateSources.flat()
  return normalizeList(merged)
}

/**
 * 构建默认渠道名称
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
 * 构建渠道表单默认值
 */
export async function prepareChannelFormData(
  account: DisplaySiteData,
  token: ApiToken | AccountToken,
): Promise<ChannelFormData> {
  const availableModels = await fetchUpstreamModelsNameList({
    baseUrl: account.baseUrl,
    apiKey: token.key,
  })

  if (!availableModels.length) {
    throw new Error(t("messages:newapi.noAnyModels"))
  }

  const resolvedGroups = token.group
    ? [token.group]
    : [...DEFAULT_CHANNEL_FIELDS.groups]

  return {
    name: buildChannelName(account, token),
    type: DEFAULT_CHANNEL_FIELDS.type,
    key: token.key,
    base_url: account.baseUrl,
    models: normalizeList(availableModels),
    groups: normalizeList(resolvedGroups),
    priority: DEFAULT_CHANNEL_FIELDS.priority,
    weight: DEFAULT_CHANNEL_FIELDS.weight,
    status: DEFAULT_CHANNEL_FIELDS.status,
  }
}

/**
 * 构建渠道创建 payload
 */
export function buildChannelPayload(
  formData: ChannelFormData,
  mode: ChannelMode = DEFAULT_CHANNEL_FIELDS.mode,
): CreateChannelPayload {
  const trimmedBaseUrl = formData.base_url.trim()
  const groups = normalizeList(
    formData.groups && formData.groups.length > 0
      ? [...formData.groups]
      : [...DEFAULT_CHANNEL_FIELDS.groups],
  )
  const models = normalizeList(formData.models ?? [])

  return {
    mode,
    channel: {
      name: formData.name.trim(),
      type: formData.type,
      key: formData.key.trim(),
      base_url: trimmedBaseUrl,
      models: models.join(","),
      groups,
      priority: formData.priority,
      weight: formData.weight,
      status: formData.status,
    },
  }
}

/**
 * 查找是否存在匹配的渠道
 */
export async function findMatchingChannel(
  baseUrl: string,
  adminToken: string,
  userId: number | string,
  accountBaseUrl: string,
  models: string[],
): Promise<ManagedSiteChannel | null> {
  const searchResults = await searchChannel(
    baseUrl,
    adminToken,
    userId,
    accountBaseUrl,
  )

  if (!searchResults) {
    return null
  }

  return (
    searchResults.items.find(
      (channel: ManagedSiteChannel) =>
        channel.base_url === accountBaseUrl &&
        isArraysEqual(parseDelimitedList(channel.models), models),
    ) ?? null
  )
}

/**
 * Additional options for importToNewApi to allow customization.
 */
export interface ImportToNewApiOptions {
  formOverrides?: Partial<ChannelFormData>
  mode?: ChannelMode
  skipExistingCheck?: boolean
}

/**
 * 将账户导入到 New API 作为渠道。
 * @param account 站点数据。
 * @param token API 令牌，用于访问上游模型与构建渠道。
 */
export async function importToNewApi(
  account: DisplaySiteData,
  token: ApiToken,
): Promise<ServiceResponse<void>> {
  try {
    const prefs = await userPreferences.getPreferences()

    if (!hasValidNewApiConfig(prefs)) {
      return {
        success: false,
        message: t("messages:newapi.configMissing"),
      }
    }

    const { newApi } = prefs
    const {
      baseUrl: newApiBaseUrl,
      adminToken: newApiAdminToken,
      userId: newApiUserId,
    } = newApi

    const formData = await prepareChannelFormData(account, token)

    const existingChannel = await findMatchingChannel(
      newApiBaseUrl!,
      newApiAdminToken!,
      newApiUserId!,
      account.baseUrl,
      formData.models,
    )

    if (existingChannel) {
      return {
        success: false,
        message: t("messages:newapi.channelExists", {
          channelName: existingChannel.name,
        }),
      }
    }

    const payload = buildChannelPayload(formData)

    const createdChannelResponse = await createChannel(
      newApiBaseUrl!,
      newApiAdminToken!,
      newApiUserId!,
      payload,
    )

    if (createdChannelResponse.success) {
      return {
        success: true,
        message: t("messages:newapi.importSuccess", {
          channelName: formData.name,
        }),
      }
    }

    return {
      success: false,
      message: createdChannelResponse.message,
    }
  } catch (error) {
    return {
      success: false,
      message: getErrorMessage(error) || t("messages:newapi.importFailed"),
    }
  }
}

// Helper function to validate New API configuration
/**
 * Validates New API configuration from user preferences and collects error messages.
 */
async function validateNewApiConfig(): Promise<{
  valid: boolean
  errors: string[]
}> {
  const prefs = await userPreferences.getPreferences()
  const errors = []

  const baseUrl = prefs.newApi?.baseUrl || prefs.newApiBaseUrl
  const adminToken = prefs.newApi?.adminToken || prefs.newApiAdminToken
  const userId = prefs.newApi?.userId || prefs.newApiUserId

  if (!baseUrl) {
    errors.push(t("messages:errors.validation.newApiBaseUrlRequired"))
  }
  if (!adminToken) {
    errors.push(t("messages:errors.validation.newApiAdminTokenRequired"))
  }
  if (!userId) {
    errors.push(t("messages:errors.validation.newApiUserIdRequired"))
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * 自动导入到 New API 中作为渠道，并通过 toast 展示进度与结果。
 * @param account 需要导入的新 API 站点账号实体。
 * @param toastId 可选 toast 标识，用于复用通知实例。
 */
export async function autoConfigToNewApi(
  account: SiteAccount,
  toastId?: string,
): Promise<AutoConfigToNewApiResponse<{ token?: ApiToken }>> {
  const configValidation = await validateNewApiConfig()
  if (!configValidation.valid) {
    return { success: false, message: configValidation.errors.join(", ") }
  }

  const displaySiteData = accountStorage.convertToDisplayData(
    account,
  ) as DisplaySiteData

  let lastError: any
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const apiToken = await ensureAccountApiToken(
        account,
        displaySiteData,
        toastId,
      )

      // 3. Import to New API as a channel
      toast.loading(t("messages:accountOperations.importingToNewApi"), {
        id: toastId,
      })
      const importResult = await importToNewApi(displaySiteData, apiToken)

      if (importResult.success) {
        toast.success(importResult.message, { id: toastId })
      } else {
        throw new Error(importResult.message)
      }

      return {
        success: importResult.success,
        message: importResult.message,
        data: { token: apiToken },
      }
    } catch (error) {
      lastError = error
      if (
        error instanceof Error &&
        (error.message.includes("network") ||
          error.message.includes("Failed to fetch")) &&
        attempt < 3
      ) {
        toast.error(getErrorMessage(lastError), { id: toastId })
        toast.loading(
          t("messages:accountOperations.retrying", { attempt: attempt + 1 }),
          { id: toastId },
        )
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt))
        continue
      }
      break
    }
  }
  toast.error(getErrorMessage(lastError), { id: toastId })
  return {
    success: false,
    message: lastError?.message || t("messages:errors.unknown"),
  }
}
