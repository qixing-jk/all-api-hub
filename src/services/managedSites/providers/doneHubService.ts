import { DoneHubChannelType } from "~/constants/doneHub"
import { DEFAULT_CHANNEL_FIELDS } from "~/constants/managedSiteChannelDraft"
import type { ManagedSiteChannelDraftRequestOptions } from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import { fetchSiteUserGroups } from "~/services/apiService/doneHub"
import { fetchManagedSiteImportModels } from "~/services/managedSites/utils/fetchManagedSiteImportModels"
import {
  userPreferences,
  type UserPreferences,
} from "~/services/preferences/userPreferences"
import { AuthTypeEnum } from "~/types"
import type { DoneHubCreateChannelPayload } from "~/types/doneHub"
import type { DoneHubConfig } from "~/types/doneHubConfig"
import type {
  ManagedSiteChannelDraft,
  ManagedSiteChannelDraftSource,
} from "~/types/managedSiteChannelDraft"
import type { NewApiFamilyChannelCommand } from "~/types/newApiFamilyChannelEditor"
import { createLogger } from "~/utils/core/logger"
import { normalizeList } from "~/utils/core/string"

import { isManagedSiteAdminUserId } from "../utils/adminUserId"
import { resolveDefaultChannelGroups } from "./defaultChannelGroups"

/**
 * Unified logger scoped to the Done Hub integration and auto-config flows.
 */
const logger = createLogger("DoneHubService")

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
 * Builds channel form defaults.
 */
export async function prepareChannelFormData(
  source: ManagedSiteChannelDraftSource,
  options?: ManagedSiteChannelDraftRequestOptions,
): Promise<ManagedSiteChannelDraft> {
  const { models: availableModels, fetchFailed } =
    await fetchManagedSiteImportModels(source, options)

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
    purpose: options?.purpose,
    onError: (error) => {
      logger.warn("Failed to resolve Done Hub default groups", error)
    },
  })

  return {
    name: source.name,
    type: DoneHubChannelType.OpenAI,
    key: source.apiKey,
    base_url: source.baseUrl,
    models: normalizeList(availableModels),
    ...(fetchFailed ? { modelPrefillFetchFailed: true } : {}),
    groups: normalizeList(resolvedGroups),
    priority: DEFAULT_CHANNEL_FIELDS.priority,
    weight: DEFAULT_CHANNEL_FIELDS.weight,
    enabled: DEFAULT_CHANNEL_FIELDS.enabled,
  }
}

/**
 * Builds channel create payload.
 */
export function buildChannelPayload(
  formData: NewApiFamilyChannelCommand,
): DoneHubCreateChannelPayload {
  const trimmedBaseUrl = formData.base_url.trim()
  const groups = normalizeList(
    formData.groups && formData.groups.length > 0
      ? [...formData.groups]
      : [...DEFAULT_CHANNEL_FIELDS.groups],
  )
  const models = normalizeList(formData.models ?? [])

  return {
    name: formData.name.trim(),
    type: Number(formData.type),
    key: formData.key.trim(),
    base_url: trimmedBaseUrl,
    models: models.join(","),
    group: groups.join(","),
    priority: formData.priority,
    weight: formData.weight,
    status: formData.status,
  }
}
