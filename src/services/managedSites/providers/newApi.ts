import { DEFAULT_CHANNEL_FIELDS } from "~/constants/managedSite"
import { normalizeAccountForManagedChannel } from "~/services/accounts/utils/siteUrlNormalization"
import type {
  ManagedSiteChannelDraftRequestOptions,
  ManagedSiteChannelSecretReadOptions,
} from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import { searchChannel as searchNewApiChannel } from "~/services/apiService/newApiFamily/channelManagement"
import {
  fetchAccountAvailableModels,
  fetchSiteUserGroups,
} from "~/services/apiService/newApiFamily/default/keyManagement"
import {
  MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS,
  MatchResolutionUnresolvedError,
} from "~/services/managedSites/channelMatch"
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
} from "~/types/managedSite"
import type { NewApiConfig } from "~/types/newApiConfig"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { normalizeList } from "~/utils/core/string"
import { normalizeUrlForOriginKey } from "~/utils/core/urlParsing"

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

const toNewApiRequestConfig = (config: NewApiConfig) => ({
  baseUrl: config.baseUrl,
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: config.adminToken,
    userId: config.userId,
  },
})

const fetchNewApiConfigUserGroups = async (config: NewApiConfig) =>
  await fetchSiteUserGroups(toNewApiRequestConfig(config))

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
 * Reads a single managed-site channel key using the New API verification flow.
 */
export async function fetchChannelSecretKey(
  config: NewApiConfig,
  channelId: number,
  options: ManagedSiteChannelSecretReadOptions,
): Promise<string> {
  const sessionConfig = await getNewApiManagedSessionConfig(config)

  return await fetchNewApiChannelKey({
    ...sessionConfig,
    channelId,
    protectionBypassExecution: options.protectionBypassExecution,
  })
}

/**
 * Hydrates hidden New API channel keys so the shared resolver can compare them.
 */
export async function hydrateComparableChannelKeys(
  config: NewApiConfig,
  candidates: ManagedSiteChannel[],
  options: ManagedSiteChannelSecretReadOptions,
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
        protectionBypassExecution: options.protectionBypassExecution,
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
  adminToken: string
  userId: string
} | null> {
  try {
    const prefs = await userPreferences.getPreferences()
    if (hasValidNewApiConfig(prefs)) {
      const { newApi } = prefs
      return {
        baseUrl: newApi.baseUrl,
        adminToken: newApi.adminToken,
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
  return await fetchManagedSiteAvailableModels(account, token, {
    fetchAccountAvailableModels:
      options?.fetchAccountAvailableModels ?? fetchAccountAvailableModels,
    ...options,
  })
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
  options?: ManagedSiteChannelDraftRequestOptions,
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
    fetchSiteUserGroups: fetchNewApiConfigUserGroups,
    operationContext: options?.operationContext,
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
