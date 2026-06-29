import { DEFAULT_CHANNEL_FIELDS } from "~/constants/managedSite"
import { SITE_TYPES } from "~/constants/siteType"
import { normalizeAccountForManagedChannel } from "~/services/accounts/utils/siteUrlNormalization"
import {
  createChannel as createNewApiChannel,
  deleteChannel as deleteNewApiChannel,
  searchChannel as searchNewApiChannel,
  updateChannel as updateNewApiChannel,
} from "~/services/apiService/newApiFamily/channelManagement"
import { fetchSiteUserGroups } from "~/services/apiService/newApiFamily/default/keyManagement"
import {
  MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS,
  MatchResolutionUnresolvedError,
} from "~/services/managedSites/channelMatch"
import { resolveManagedSiteImportDuplicate } from "~/services/managedSites/importDuplicateResolution"
import {
  fetchNewApiChannelKey,
  NewApiChannelKeyRequirementError,
} from "~/services/managedSites/providers/newApiSession"
import {
  fetchManagedSiteAvailableModels,
  type FetchManagedSiteAvailableModelsOptions,
} from "~/services/managedSites/utils/fetchManagedSiteAvailableModels"
import { fetchTokenScopedModels } from "~/services/managedSites/utils/fetchTokenScopedModels"
import { ApiToken, AuthTypeEnum, DisplaySiteData } from "~/types"
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
import type { ServiceResponse } from "~/types/serviceResponse"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { normalizeList } from "~/utils/core/string"
import { normalizeUrlForOriginKey } from "~/utils/core/urlParsing"
import { t } from "~/utils/i18n/core"

import {
  UserPreferences,
  userPreferences,
} from "../../preferences/userPreferences"
import { isManagedSiteAdminUserId } from "../utils/adminUserId"
import { resolveDefaultChannelGroups } from "./defaultChannelGroups"

/**
 * Unified logger scoped to the New API integration and auto-config flows.
 */
const logger = createLogger("NewApiService")

const newApiImportDuplicateService = {
  siteType: SITE_TYPES.NEW_API,
  searchChannel,
  hydrateComparableChannelKeys,
  fetchChannelSecretKey,
}

const toNewApiRequestConfig = (config: NewApiConfig) => ({
  baseUrl: config.baseUrl,
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: config.adminToken,
    userId: config.userId,
  },
})

/**
 * 搜索指定关键词的渠道
 * @param config New API runtime config
 * @param keyword 搜索关键词
 */
export async function searchChannel(
  config: NewApiConfig,
  keyword: string,
): Promise<ManagedSiteChannelListData | null> {
  return await searchNewApiChannel(toNewApiRequestConfig(config), keyword)
}

/**
 * 创建新渠道
 * @param config New API runtime config
 * @param channelData 渠道数据
 */
export async function createChannel(
  config: NewApiConfig,
  channelData: CreateChannelPayload,
) {
  return await createNewApiChannel(toNewApiRequestConfig(config), channelData)
}

/**
 * 更新新渠道
 * @param config New API runtime config
 * @param channelData 渠道数据
 */
export async function updateChannel(
  config: NewApiConfig,
  channelData: UpdateChannelPayload,
) {
  return await updateNewApiChannel(toNewApiRequestConfig(config), channelData)
}

/**
 * 删除渠道
 */
export async function deleteChannel(config: NewApiConfig, channelId: number) {
  return await deleteNewApiChannel(toNewApiRequestConfig(config), channelId)
}

/**
 * Reads a single managed-site channel key using the New API verification flow.
 */
export async function fetchChannelSecretKey(
  config: NewApiConfig,
  channelId: number,
): Promise<string> {
  const sessionConfig = await getNewApiManagedSessionConfig(config)

  return await fetchNewApiChannelKey({
    ...sessionConfig,
    channelId,
  })
}

/**
 * Hydrates hidden New API channel keys so the shared resolver can compare them.
 */
export async function hydrateComparableChannelKeys(
  config: NewApiConfig,
  candidates: ManagedSiteChannel[],
): Promise<ManagedSiteChannel[]> {
  const sessionConfig = await getNewApiManagedSessionConfig(config)
  const hydratedCandidates: ManagedSiteChannel[] = []

  for (const candidate of candidates) {
    if (candidate.key?.trim()) {
      hydratedCandidates.push(candidate)
      continue
    }

    try {
      const resolvedKey = await fetchNewApiChannelKey({
        ...sessionConfig,
        channelId: candidate.id,
      })

      hydratedCandidates.push({
        ...candidate,
        key: resolvedKey,
      })
    } catch (error) {
      if (error instanceof NewApiChannelKeyRequirementError) {
        throw new MatchResolutionUnresolvedError(
          MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS.VERIFICATION_REQUIRED,
        )
      }

      logger.warn("Failed to hydrate hidden New API channel key", {
        baseUrl: config.baseUrl,
        channelId: candidate.id,
        error: getErrorMessage(error),
      })

      throw new MatchResolutionUnresolvedError(
        MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS.KEY_RESOLUTION_FAILED,
      )
    }
  }

  return hydratedCandidates
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

  return Boolean(
    newApi.baseUrl &&
      newApi.adminToken &&
      isManagedSiteAdminUserId(newApi.userId),
  )
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
  config: Pick<NewApiConfig, "baseUrl" | "userId">,
): Promise<
  Pick<
    NewApiConfig,
    "baseUrl" | "userId" | "username" | "password" | "totpSecret"
  >
> => {
  const loginAssistConfig = await getNewApiLoginAssistConfig()
  const canReuseLoginAssist =
    loginAssistConfig &&
    sharesNewApiOrigin(loginAssistConfig.baseUrl, config.baseUrl)

  return {
    baseUrl: config.baseUrl,
    userId: config.userId?.toString() ?? "",
    username: canReuseLoginAssist ? loginAssistConfig.username ?? "" : "",
    password: canReuseLoginAssist ? loginAssistConfig.password ?? "" : "",
    totpSecret: canReuseLoginAssist ? loginAssistConfig.totpSecret ?? "" : "",
  }
}

/**
 * 获取账号支持的模型列表。
 * 仅基于实时探测结果返回模型，不读取 token.models 这类静态限制元数据。
 */
export async function fetchAvailableModels(
  account: DisplaySiteData,
  token: ApiToken,
  options?: FetchManagedSiteAvailableModelsOptions,
): Promise<string[]> {
  return options
    ? await fetchManagedSiteAvailableModels(account, token, options)
    : await fetchManagedSiteAvailableModels(account, token)
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
  const upstreamAccount = normalizeAccountForManagedChannel(account)

  // Channel import prefill must reflect only the selected key's live upstream
  // model list; on failure we keep the dialog editable and require manual input.
  const { models: availableModels, fetchFailed } = await fetchTokenScopedModels(
    upstreamAccount,
    token,
  )

  const resolvedGroups = await resolveDefaultChannelGroups({
    getConfig: getNewApiConfig,
    fetchSiteUserGroups: async (config) =>
      await fetchSiteUserGroups({
        baseUrl: config.baseUrl,
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: config.token,
          userId: config.userId,
        },
      }),
    onError: (error) => {
      logger.warn("Failed to resolve New API default groups", error)
    },
  })

  return {
    name: buildChannelName(account, token),
    type: DEFAULT_CHANNEL_FIELDS.type,
    key: token.key,
    base_url: upstreamAccount.baseUrl,
    models: normalizeList(availableModels),
    ...(fetchFailed ? { modelPrefillFetchFailed: true } : {}),
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

    const managedConfig = {
      baseUrl: newApiBaseUrl!,
      adminToken: newApiAdminToken!,
      userId: newApiUserId!,
    }

    const existingChannel = await resolveManagedSiteImportDuplicate({
      service: newApiImportDuplicateService,
      managedConfig,
      formData,
    })

    if (existingChannel) {
      return {
        success: false,
        message: t("messages:newapi.channelExists", {
          channelName: existingChannel.name,
        }),
      }
    }

    const payload = buildChannelPayload(formData)

    const createdChannelResponse = await createChannel(managedConfig, payload)

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
    if (
      error instanceof MatchResolutionUnresolvedError &&
      error.reason ===
        MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS.VERIFICATION_REQUIRED
    ) {
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
