import { DEFAULT_CHANNEL_FIELDS } from "~/constants/managedSiteChannelDraft"
import { normalizeAccountForManagedChannel } from "~/services/accounts/utils/siteUrlNormalization"
import type { ManagedSiteChannelDraftRequestOptions } from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import { fetchSiteUserGroups } from "~/services/apiService/newApiFamily/default/keyManagement"
import { buildManagedSiteChannelName } from "~/services/managedSites/utils/channelDraft"
import { fetchTokenScopedModels } from "~/services/managedSites/utils/fetchTokenScopedModels"
import type { AccountToken } from "~/types"
import { AuthTypeEnum, type ApiToken, type DisplaySiteData } from "~/types"
import type { ManagedSiteChannelDraft } from "~/types/managedSiteChannelDraft"
import type { ChannelMode, CreateChannelPayload } from "~/types/newApi"
import { CHANNEL_MODE } from "~/types/newApi"
import type { NewApiConfig } from "~/types/newApiConfig"
import { createLogger } from "~/utils/core/logger"
import { normalizeList } from "~/utils/core/string"

import {
  userPreferences,
  type UserPreferences,
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
 * 构建渠道表单默认值
 */
export async function prepareChannelFormData(
  account: DisplaySiteData,
  token: ApiToken | AccountToken,
  options?: ManagedSiteChannelDraftRequestOptions,
): Promise<ManagedSiteChannelDraft> {
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
    name: buildManagedSiteChannelName(account, token),
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
  formData: ManagedSiteChannelDraft,
  mode: ChannelMode = CHANNEL_MODE.SINGLE,
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
