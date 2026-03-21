import toast from "react-hot-toast"

import { DEFAULT_CHANNEL_FIELDS } from "~/constants/managedSite"
import { NEW_API } from "~/constants/siteType"
import { ensureAccountApiToken } from "~/services/accounts/accountOperations"
import { accountStorage } from "~/services/accounts/accountStorage"
import { getApiService } from "~/services/apiService"
import { fetchOpenAICompatibleModelIds } from "~/services/apiService/openaiCompatible"
import {
  MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS,
  MatchResolutionUnresolvedError,
} from "~/services/managedSites/channelMatch"
import {
  fetchNewApiChannelKey,
  NewApiChannelKeyRequirementError,
} from "~/services/managedSites/providers/newApiSession"
import {
  findManagedSiteChannelByComparableInputs,
  findManagedSiteChannelsByBaseUrlAndModels,
} from "~/services/managedSites/utils/channelMatching"
import { ApiToken, AuthTypeEnum, DisplaySiteData, SiteAccount } from "~/types"
import type { AccountToken } from "~/types"
import type {
  ChannelFormData,
  ChannelMode,
  CreateChannelPayload,
  ManagedSiteChannel,
  ManagedSiteChannelListData,
  UpdateChannelPayload,
} from "~/types/managedSite"
import type { NewApiConfig } from "~/types/newApiConfig"
import type {
  AutoConfigToNewApiResponse,
  ServiceResponse,
} from "~/types/serviceResponse"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { normalizeList, parseDelimitedList } from "~/utils/core/string"
import { normalizeUrlForOriginKey } from "~/utils/core/urlParsing"
import { t } from "~/utils/i18n/core"

import {
  UserPreferences,
  userPreferences,
} from "../../preferences/userPreferences"
import { resolveDefaultChannelGroups } from "./defaultChannelGroups"

/**
 * Unified logger scoped to the New API integration and auto-config flows.
 */
const logger = createLogger("NewApiService")

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
    {
      baseUrl,
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken,
        userId,
      },
    },
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
    {
      baseUrl,
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: adminToken,
        userId,
      },
    },
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
    {
      baseUrl,
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: adminToken,
        userId,
      },
    },
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
    {
      baseUrl,
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: adminToken,
        userId,
      },
    },
    channelId,
  )
}

/**
 * Reads a single managed-site channel key using the New API verification flow.
 */
export async function fetchChannelSecretKey(
  baseUrl: string,
  _adminToken: string,
  userId: number | string,
  channelId: number,
): Promise<string> {
  const sessionConfig = await getNewApiManagedSessionConfig(baseUrl, userId)

  return await fetchNewApiChannelKey({
    ...sessionConfig,
    channelId,
  })
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
    logger.error("Error checking config", error)
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
    logger.error("Error getting config", error)
    return null
  }
}

/**
 * Reads the optional New API login-assist fields used by the session-backed
 * verification flow without changing the existing admin-token config contract.
 */
export async function getNewApiLoginAssistConfig(): Promise<Pick<
  NewApiConfig,
  "baseUrl" | "username" | "password" | "totpSecret"
> | null> {
  try {
    const prefs = await userPreferences.getPreferences()
    const newApi = prefs?.newApi

    if (!newApi?.baseUrl) {
      return null
    }

    return {
      baseUrl: newApi.baseUrl,
      username: newApi.username ?? "",
      password: newApi.password ?? "",
      totpSecret: newApi.totpSecret ?? "",
    }
  } catch (error) {
    logger.error("Error getting New API login-assist config", error)
    return null
  }
}

const sharesNewApiOrigin = (leftBaseUrl: string, rightBaseUrl: string) => {
  const leftOrigin =
    normalizeUrlForOriginKey(leftBaseUrl, { stripTrailingSlashes: true }) ||
    leftBaseUrl.trim()
  const rightOrigin =
    normalizeUrlForOriginKey(rightBaseUrl, { stripTrailingSlashes: true }) ||
    rightBaseUrl.trim()

  return Boolean(leftOrigin && rightOrigin && leftOrigin === rightOrigin)
}

const getNewApiManagedSessionConfig = async (
  baseUrl: string,
  userId: number | string,
): Promise<
  Pick<
    NewApiConfig,
    "baseUrl" | "userId" | "username" | "password" | "totpSecret"
  >
> => {
  const loginAssistConfig = await getNewApiLoginAssistConfig()
  const canReuseLoginAssist =
    loginAssistConfig && sharesNewApiOrigin(loginAssistConfig.baseUrl, baseUrl)

  return {
    baseUrl,
    userId: userId?.toString() ?? "",
    username: canReuseLoginAssist ? loginAssistConfig.username ?? "" : "",
    password: canReuseLoginAssist ? loginAssistConfig.password ?? "" : "",
    totpSecret: canReuseLoginAssist ? loginAssistConfig.totpSecret ?? "" : "",
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
    const upstreamModels = await fetchOpenAICompatibleModelIds({
      baseUrl: account.baseUrl,
      apiKey: token.key,
    })
    if (upstreamModels && upstreamModels.length > 0) {
      candidateSources.push(upstreamModels)
    }
  } catch (error) {
    logger.warn("Failed to fetch upstream models", error)
  }

  try {
    const fallbackModels = await getApiService(
      account.siteType,
    ).fetchAccountAvailableModels({
      baseUrl: account.baseUrl,
      accountId: account.id,
      auth: {
        authType: account.authType,
        userId: account.userId,
        accessToken: account.token,
        cookie: account.cookieAuthSessionCookie,
      },
    })
    if (fallbackModels && fallbackModels.length > 0) {
      candidateSources.push(fallbackModels)
    }
  } catch (error) {
    logger.warn("Failed to fetch fallback models", error)
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
  const availableModels = await fetchOpenAICompatibleModelIds({
    baseUrl: account.baseUrl,
    apiKey: token.key,
  })

  if (!availableModels.length) {
    throw new Error(t("messages:newapi.noAnyModels"))
  }

  const resolvedGroups = await resolveDefaultChannelGroups({
    siteType: NEW_API,
    getConfig: getNewApiConfig,
    onError: (error) => {
      logger.warn("Failed to resolve New API default groups", error)
    },
  })

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
 * 查找是否存在匹配的渠道。
 *
 * 默认匹配条件为 base_url + models；当传入 key 时，会进一步按 key 精确匹配，
 * 避免把不同 key 的渠道误判为重复。
 */
export async function findMatchingChannel(
  baseUrl: string,
  adminToken: string,
  userId: number | string,
  accountBaseUrl: string,
  models: string[],
  key?: string,
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

  const exactMatch = findManagedSiteChannelByComparableInputs({
    channels: searchResults.items,
    accountBaseUrl,
    models,
    key,
  })

  if (exactMatch || !key?.trim()) {
    return exactMatch
  }

  const narrowedCandidates = findManagedSiteChannelsByBaseUrlAndModels({
    channels: searchResults.items,
    accountBaseUrl,
    models,
  }).filter((channel) => !channel.key?.trim())

  if (narrowedCandidates.length === 0) {
    return null
  }

  const sessionConfig = await getNewApiManagedSessionConfig(baseUrl, userId)
  const resolvedCandidates: ManagedSiteChannel[] = []

  for (const candidate of narrowedCandidates) {
    try {
      const resolvedKey = await fetchNewApiChannelKey({
        ...sessionConfig,
        channelId: candidate.id,
      })

      resolvedCandidates.push({
        ...candidate,
        key: resolvedKey,
      })
    } catch (error) {
      if (error instanceof NewApiChannelKeyRequirementError) {
        throw new MatchResolutionUnresolvedError(
          MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS.VERIFICATION_REQUIRED,
        )
      }

      logger.warn("Failed to fetch hidden New API channel key", {
        baseUrl,
        channelId: candidate.id,
        error: getErrorMessage(error),
      })

      throw new MatchResolutionUnresolvedError(
        MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS.VERIFICATION_REQUIRED,
      )
    }
  }

  return findManagedSiteChannelByComparableInputs({
    channels: resolvedCandidates,
    accountBaseUrl,
    models,
    key,
  })
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
      formData.key,
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
    if (error instanceof MatchResolutionUnresolvedError) {
      return {
        success: false,
        message: t("messages:newapi.channelMatchUnresolved"),
      }
    }

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

  const displaySiteData = accountStorage.convertToDisplayData(account)

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
