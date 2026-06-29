import { DEFAULT_CHANNEL_FIELDS } from "~/constants/managedSite"
import { normalizeAccountForManagedChannel } from "~/services/accounts/utils/siteUrlNormalization"
import {
  fetchAccountAvailableModels,
  fetchSiteUserGroups,
} from "~/services/apiService/newApiFamily/default/keyManagement"
import {
  createChannel as createVeloeraChannel,
  deleteChannel as deleteVeloeraChannel,
  fetchChannel as fetchVeloeraChannel,
  searchChannel as searchVeloeraChannel,
  updateChannel as updateVeloeraChannel,
} from "~/services/apiService/veloera"
import {
  MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS,
  MatchResolutionUnresolvedError,
} from "~/services/managedSites/channelMatch"
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
import type { VeloeraConfig } from "~/types/veloeraConfig"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { normalizeList, parseDelimitedList } from "~/utils/core/string"

import {
  UserPreferences,
  userPreferences,
} from "../../preferences/userPreferences"
import { isManagedSiteAdminUserId } from "../utils/adminUserId"
import { resolveDefaultChannelGroups } from "./defaultChannelGroups"

/**
 * Unified logger scoped to the Veloera integration and auto-config flows.
 */
const logger = createLogger("VeloeraService")

const toVeloeraRequestConfig = (config: VeloeraConfig) => ({
  baseUrl: config.baseUrl,
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: config.adminToken,
    userId: config.userId,
  },
})

/**
 * Searches channels matching the keyword.
 */
export async function searchChannel(
  config: VeloeraConfig,
  keyword: string,
): Promise<ManagedSiteChannelListData | null> {
  return await searchVeloeraChannel(toVeloeraRequestConfig(config), keyword)
}

/**
 * Creates a channel.
 */
export async function createChannel(
  config: VeloeraConfig,
  channelData: CreateChannelPayload,
) {
  return await createVeloeraChannel(toVeloeraRequestConfig(config), channelData)
}

/**
 * Updates a channel.
 */
export async function updateChannel(
  config: VeloeraConfig,
  channelData: UpdateChannelPayload,
) {
  return await updateVeloeraChannel(toVeloeraRequestConfig(config), channelData)
}

/**
 * Deletes a channel.
 */
export async function deleteChannel(config: VeloeraConfig, channelId: number) {
  return await deleteVeloeraChannel(toVeloeraRequestConfig(config), channelId)
}

/**
 * Fetches the full secret key for a Veloera channel from its detail payload.
 */
export async function fetchChannelSecretKey(
  config: VeloeraConfig,
  channelId: number,
): Promise<string> {
  const channel = await fetchVeloeraChannel(
    toVeloeraRequestConfig(config),
    channelId,
  )

  const key = channel.key?.trim()
  if (!key) {
    throw new Error("veloera_channel_key_missing")
  }

  return key
}

/**
 * Hydrates Veloera channel keys from detail payloads for shared comparison.
 */
export async function hydrateComparableChannelKeys(
  config: VeloeraConfig,
  candidates: ManagedSiteChannel[],
): Promise<ManagedSiteChannel[]> {
  const hydratedCandidates: ManagedSiteChannel[] = []

  for (const candidate of candidates) {
    if (candidate.key?.trim()) {
      hydratedCandidates.push(candidate)
      continue
    }

    try {
      const key = await fetchChannelSecretKey(config, candidate.id)

      hydratedCandidates.push({
        ...candidate,
        key,
      })
    } catch (error) {
      logger.warn("Failed to hydrate Veloera channel key", {
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
 * Checks whether the given user preferences contain a complete Veloera config.
 */
export function hasValidVeloeraConfig(prefs: UserPreferences | null): boolean {
  if (!prefs) {
    return false
  }

  const { veloera } = prefs

  if (!veloera) {
    return false
  }

  return Boolean(
    veloera.baseUrl &&
      veloera.adminToken &&
      isManagedSiteAdminUserId(veloera.userId),
  )
}

/**
 * Validates Veloera configuration stored in user preferences.
 */
export async function checkValidVeloeraConfig(): Promise<boolean> {
  try {
    const prefs = await userPreferences.getPreferences()
    return hasValidVeloeraConfig(prefs)
  } catch (error) {
    logger.error("Error checking config", error)
    return false
  }
}

/**
 * Gets Veloera configuration from user preferences.
 */
export async function getVeloeraConfig(): Promise<{
  baseUrl: string
  adminToken: string
  userId: string
} | null> {
  try {
    const prefs = await userPreferences.getPreferences()
    if (hasValidVeloeraConfig(prefs)) {
      const { veloera } = prefs
      return {
        baseUrl: veloera.baseUrl,
        adminToken: veloera.adminToken,
        userId: veloera.userId,
      }
    }
    return null
  } catch (error) {
    logger.error("Error getting config", error)
    return null
  }
}

/**
 * Gets the models available for the given account.
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
 * Builds a default channel name.
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
 * Builds default channel form values.
 */
export async function prepareChannelFormData(
  account: DisplaySiteData,
  token: ApiToken | AccountToken,
): Promise<ChannelFormData> {
  const upstreamAccount = normalizeAccountForManagedChannel(account)
  const tokenModelList = parseDelimitedList(token.models)
  const { models: availableModels, fetchFailed } = await fetchTokenScopedModels(
    upstreamAccount,
    token,
  )
  const resolvedModels =
    availableModels.length > 0 ? availableModels : tokenModelList

  const resolvedGroups = await resolveDefaultChannelGroups({
    getConfig: getVeloeraConfig,
    fetchSiteUserGroups: async (config) =>
      await fetchSiteUserGroups({
        baseUrl: config.baseUrl,
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: config.adminToken,
          userId: config.userId,
        },
      }),
    onError: (error) => {
      logger.warn("Failed to resolve Veloera default groups", error)
    },
  })

  return {
    name: buildChannelName(account, token),
    type: DEFAULT_CHANNEL_FIELDS.type,
    key: token.key,
    base_url: upstreamAccount.baseUrl,
    models: normalizeList(resolvedModels),
    ...(fetchFailed ? { modelPrefillFetchFailed: true } : {}),
    groups: normalizeList(resolvedGroups),
    priority: DEFAULT_CHANNEL_FIELDS.priority,
    weight: DEFAULT_CHANNEL_FIELDS.weight,
    status: DEFAULT_CHANNEL_FIELDS.status,
  }
}

/**
 * Builds the create-channel payload from form state.
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
