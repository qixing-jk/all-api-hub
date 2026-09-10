import { DEFAULT_CHANNEL_FIELDS } from "~/constants/managedSiteChannelDraft"
import { VeloeraChannelType } from "~/constants/veloera"
import type { ManagedSiteChannelDraftRequestOptions } from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import { fetchSiteUserGroups } from "~/services/apiService/newApiFamily/default/keyManagement"
import { fetchManagedSiteImportModels } from "~/services/managedSites/utils/fetchManagedSiteImportModels"
import { AuthTypeEnum } from "~/types"
import type {
  ManagedSiteChannelDraft,
  ManagedSiteChannelDraftSource,
} from "~/types/managedSiteChannelDraft"
import type { NewApiFamilyChannelCommand } from "~/types/newApiFamilyChannelEditor"
import type { VeloeraCreateChannelPayload } from "~/types/veloera"
import { createLogger } from "~/utils/core/logger"
import { normalizeList } from "~/utils/core/string"

import {
  userPreferences,
  type UserPreferences,
} from "../../preferences/userPreferences"
import { isManagedSiteAdminUserId } from "../utils/adminUserId"
import { resolveDefaultChannelGroups } from "./defaultChannelGroups"

/**
 * Unified logger scoped to the Veloera integration and auto-config flows.
 */
const logger = createLogger("VeloeraService")

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
 * Builds default channel form values.
 */
export async function prepareChannelFormData(
  source: ManagedSiteChannelDraftSource,
  options?: ManagedSiteChannelDraftRequestOptions,
): Promise<ManagedSiteChannelDraft> {
  const { models: availableModels, fetchFailed } =
    await fetchManagedSiteImportModels(source)
  const resolvedModels =
    availableModels.length > 0 ? availableModels : source.modelHints

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
    operationContext: options?.operationContext,
    onError: (error) => {
      logger.warn("Failed to resolve Veloera default groups", error)
    },
  })

  return {
    name: source.name,
    type: VeloeraChannelType.OpenAI,
    key: source.apiKey,
    base_url: source.baseUrl,
    models: normalizeList(resolvedModels),
    ...(fetchFailed ? { modelPrefillFetchFailed: true } : {}),
    groups: normalizeList(resolvedGroups),
    priority: DEFAULT_CHANNEL_FIELDS.priority,
    weight: DEFAULT_CHANNEL_FIELDS.weight,
    enabled: DEFAULT_CHANNEL_FIELDS.enabled,
  }
}

/**
 * Builds the create-channel payload from form state.
 */
export function buildChannelPayload(
  formData: NewApiFamilyChannelCommand,
): VeloeraCreateChannelPayload {
  const trimmedBaseUrl = formData.base_url.trim()
  const groups = normalizeList(
    formData.groups && formData.groups.length > 0
      ? [...formData.groups]
      : [...DEFAULT_CHANNEL_FIELDS.groups],
  )
  const models = normalizeList(formData.models ?? [])

  return {
    name: formData.name.trim(),
    type: formData.type,
    key: formData.key.trim(),
    base_url: trimmedBaseUrl,
    models: models.join(","),
    group: groups.join(","),
    priority: formData.priority,
    weight: formData.weight,
    status: formData.status,
  }
}
