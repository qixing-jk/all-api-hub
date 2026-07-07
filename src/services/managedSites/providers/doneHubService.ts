import { DEFAULT_CHANNEL_FIELDS } from "~/constants/managedSite"
import { SITE_TYPES } from "~/constants/siteType"
import { normalizeAccountForManagedChannel } from "~/services/accounts/utils/siteUrlNormalization"
import type { ManagedSiteChannelDraftRequestOptions } from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import { createNewApiKeyManagement } from "~/services/apiAdapters/newApi/keyManagement"
import {
  createChannel as createDoneHubChannel,
  deleteChannel as deleteDoneHubChannel,
  fetchChannel as fetchDoneHubChannel,
  fetchSiteUserGroups,
  searchChannel as searchDoneHubChannel,
  updateChannel as updateDoneHubChannel,
} from "~/services/apiService/doneHub"
import {
  MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS,
  MatchResolutionUnresolvedError,
} from "~/services/managedSites/channelMatch"
import {
  fetchManagedSiteAvailableModels,
  type FetchManagedSiteAvailableModelsOptions,
} from "~/services/managedSites/utils/fetchManagedSiteAvailableModels"
import { fetchTokenScopedModels } from "~/services/managedSites/utils/fetchTokenScopedModels"
import {
  UserPreferences,
  userPreferences,
} from "~/services/preferences/userPreferences"
import { ApiToken, AuthTypeEnum, DisplaySiteData } from "~/types"
import type { AccountToken } from "~/types"
import type { DoneHubConfig } from "~/types/doneHubConfig"
import type {
  ChannelFormData,
  ChannelMode,
  CreateChannelPayload,
  ManagedSiteChannel,
  ManagedSiteChannelListData,
  UpdateChannelPayload,
} from "~/types/managedSite"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { normalizeList } from "~/utils/core/string"

import { isManagedSiteAdminUserId } from "../utils/adminUserId"
import { resolveDefaultChannelGroups } from "./defaultChannelGroups"

/**
 * Unified logger scoped to the Done Hub integration and auto-config flows.
 */
const logger = createLogger("DoneHubService")
const keyManagement = createNewApiKeyManagement(SITE_TYPES.DONE_HUB)

const toDoneHubRequestConfig = (config: DoneHubConfig) => ({
  baseUrl: config.baseUrl,
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: config.adminToken,
    userId: config.userId,
  },
})

const toSafeDoneHubChannelDetailDiagnostic = (error: unknown): string => {
  const message = getErrorMessage(error) || "Unknown error"

  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string" &&
    error.code.trim() !== ""
  ) {
    return `${message} (${error.code})`
  }

  return message
}

/**
 * Searches channels matching the keyword.
 */
export async function searchChannel(
  config: DoneHubConfig,
  keyword: string,
): Promise<ManagedSiteChannelListData | null> {
  return await searchDoneHubChannel(toDoneHubRequestConfig(config), keyword)
}

/**
 * Creates a channel.
 */
export async function createChannel(
  config: DoneHubConfig,
  channelData: CreateChannelPayload,
) {
  return await createDoneHubChannel(toDoneHubRequestConfig(config), channelData)
}

/**
 * Updates a channel.
 */
export async function updateChannel(
  config: DoneHubConfig,
  channelData: UpdateChannelPayload,
) {
  return await updateDoneHubChannel(toDoneHubRequestConfig(config), channelData)
}

/**
 * Deletes a channel.
 */
export async function deleteChannel(config: DoneHubConfig, channelId: number) {
  return await deleteDoneHubChannel(toDoneHubRequestConfig(config), channelId)
}

/**
 * Fetches the full secret key for a Done Hub channel from its detail payload.
 */
export async function fetchChannelSecretKey(
  config: DoneHubConfig,
  channelId: number,
): Promise<string> {
  const channel = await fetchDoneHubChannel(
    toDoneHubRequestConfig(config),
    channelId,
  )

  const key = channel.key?.trim()
  if (!key) {
    throw new Error("done_hub_channel_key_missing")
  }

  return key
}

/**
 * Hydrates Done Hub channel keys from detail payloads for shared comparison.
 */
export async function hydrateComparableChannelKeys(
  config: DoneHubConfig,
  candidates: ManagedSiteChannel[],
): Promise<ManagedSiteChannel[]> {
  const hydratedCandidates: ManagedSiteChannel[] = []

  for (const candidate of candidates) {
    if (candidate.key?.trim() || !candidate.id) {
      hydratedCandidates.push(candidate)
      continue
    }

    try {
      const detail = await fetchDoneHubChannel(
        toDoneHubRequestConfig(config),
        candidate.id,
      )
      const key = detail.key?.trim()
      if (!key) {
        throw new Error("done_hub_channel_key_missing")
      }

      hydratedCandidates.push({
        ...candidate,
        key,
      })
    } catch (error) {
      logger.warn("Failed to fetch Done Hub channel detail for key matching", {
        channelId: candidate.id,
        diagnostic: toSafeDoneHubChannelDetailDiagnostic(error),
      })

      throw new MatchResolutionUnresolvedError(
        MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS.KEY_RESOLUTION_FAILED,
      )
    }
  }

  return hydratedCandidates
}

/**
 * Checks whether the given user preferences contain a complete Done Hub config.
 */
function hasValidDoneHubConfig(
  prefs: UserPreferences | null,
): prefs is UserPreferences & { doneHub: DoneHubConfig } {
  if (!prefs) {
    return false
  }

  const { doneHub } = prefs

  if (!doneHub) {
    return false
  }

  return Boolean(
    doneHub.baseUrl &&
      doneHub.adminToken &&
      isManagedSiteAdminUserId(doneHub.userId),
  )
}

/**
 * Validates Done Hub configuration stored in user preferences.
 */
export async function checkValidDoneHubConfig(): Promise<boolean> {
  try {
    const prefs = await userPreferences.getPreferences()
    return hasValidDoneHubConfig(prefs)
  } catch (error) {
    logger.error("Error checking config", error)
    return false
  }
}

/**
 * Gets Done Hub configuration from user preferences.
 */
export async function getDoneHubConfig(): Promise<{
  baseUrl: string
  adminToken: string
  userId: string
} | null> {
  try {
    const prefs = await userPreferences.getPreferences()
    if (hasValidDoneHubConfig(prefs)) {
      const { doneHub } = prefs
      return {
        baseUrl: doneHub.baseUrl,
        adminToken: doneHub.adminToken,
        userId: doneHub.userId,
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
      options?.fetchAccountAvailableModels ??
      keyManagement.fetchAvailableModels,
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
 * Builds channel form defaults.
 */
export async function prepareChannelFormData(
  account: DisplaySiteData,
  token: ApiToken | AccountToken,
  options?: ManagedSiteChannelDraftRequestOptions,
): Promise<ChannelFormData> {
  const upstreamAccount = normalizeAccountForManagedChannel(account)
  const { models: availableModels, fetchFailed } = await fetchTokenScopedModels(
    upstreamAccount,
    token,
  )

  const resolvedGroups = await resolveDefaultChannelGroups({
    getConfig: getDoneHubConfig,
    fetchSiteUserGroups: async (config) =>
      await fetchSiteUserGroups({
        baseUrl: config.baseUrl,
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: config.adminToken,
          userId: config.userId,
        },
      }),
    operationContext: options?.operationContext,
    onError: (error) => {
      logger.warn("Failed to resolve Done Hub default groups", error)
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
 * Builds channel create payload.
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
