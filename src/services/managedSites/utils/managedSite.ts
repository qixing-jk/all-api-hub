import type { TFunction } from "i18next"

import { SITE_TYPES, type ManagedSiteType } from "~/constants/siteType"
import { hasUsableApiTokenKey } from "~/services/apiService/common/apiKey"
import {
  getManagedSiteLegacyAdminConfig,
  resolveManagedSiteRuntimeConfigForType,
  type ManagedSiteRuntimeConfigValue,
} from "~/services/managedSites/runtimeConfig"
import type { UserPreferences } from "~/services/preferences/userPreferences"

export type ManagedSiteLabelKey =
  | "settings:managedSite.newApi"
  | "settings:managedSite.doneHub"
  | "settings:managedSite.veloera"
  | "settings:managedSite.octopus"
  | "settings:managedSite.axonHub"
  | "settings:managedSite.claudeCodeHub"

/**
 * Managed site namespace key used under the `messages` i18n namespace.
 */
export type ManagedSiteMessagesKey =
  | "newapi"
  | "donehub"
  | "veloera"
  | "octopus"
  | "axonhub"
  | "claudecodehub"

export interface ManagedSiteAdminConfig {
  baseUrl: string
  adminToken: string
  userId: string
}

export interface ManagedSiteTargetOption {
  siteType: ManagedSiteType
  labelKey: ManagedSiteLabelKey
  messagesKey: ManagedSiteMessagesKey
  config: ManagedSiteAdminConfig
}

export const collectManagedConfigSecrets = (
  managedConfig: ManagedSiteRuntimeConfigValue,
): string[] => {
  const secrets: string[] = []
  if ("token" in managedConfig && typeof managedConfig.token === "string") {
    secrets.push(managedConfig.token)
  }
  if ("adminToken" in managedConfig) {
    secrets.push(managedConfig.adminToken)
  }
  if (
    "password" in managedConfig &&
    typeof managedConfig.password === "string"
  ) {
    secrets.push(managedConfig.password)
  }
  return secrets
}

/**
 * Returns the i18n key for the managed site label shown in UI.
 */
export function getManagedSiteLabelKey(
  siteType: ManagedSiteType,
): ManagedSiteLabelKey {
  if (siteType === SITE_TYPES.OCTOPUS) {
    return "settings:managedSite.octopus"
  }
  if (siteType === SITE_TYPES.AXON_HUB) {
    return "settings:managedSite.axonHub"
  }
  if (siteType === SITE_TYPES.CLAUDE_CODE_HUB) {
    return "settings:managedSite.claudeCodeHub"
  }
  if (siteType === SITE_TYPES.DONE_HUB) {
    return "settings:managedSite.doneHub"
  }
  return siteType === SITE_TYPES.VELOERA
    ? "settings:managedSite.veloera"
    : "settings:managedSite.newApi"
}

/**
 * Returns the translated managed-site label for the given site type.
 */
export function getManagedSiteLabel(t: TFunction, siteType: ManagedSiteType) {
  switch (siteType) {
    case SITE_TYPES.OCTOPUS:
      return t("settings:managedSite.octopus")
    case SITE_TYPES.AXON_HUB:
      return t("settings:managedSite.axonHub")
    case SITE_TYPES.CLAUDE_CODE_HUB:
      return t("settings:managedSite.claudeCodeHub")
    case SITE_TYPES.DONE_HUB:
      return t("settings:managedSite.doneHub")
    case SITE_TYPES.VELOERA:
      return t("settings:managedSite.veloera")
    case SITE_TYPES.NEW_API:
    default:
      return t("settings:managedSite.newApi")
  }
}

/**
 * Returns the `messages` namespace key for the selected managed site type.
 */
export function getManagedSiteMessagesKeyFromSiteType(
  siteType: ManagedSiteType,
): ManagedSiteMessagesKey {
  if (siteType === SITE_TYPES.OCTOPUS) {
    return "octopus"
  }
  if (siteType === SITE_TYPES.AXON_HUB) {
    return "axonhub"
  }
  if (siteType === SITE_TYPES.CLAUDE_CODE_HUB) {
    return "claudecodehub"
  }
  if (siteType === SITE_TYPES.DONE_HUB) {
    return "donehub"
  }
  return siteType === SITE_TYPES.VELOERA ? "veloera" : "newapi"
}

/**
 * Extracts the current managed site admin config from user preferences.
 *
 * Note: this intentionally reads `preferences.managedSiteType` to ensure the
 * returned config always matches the real selected managed site type.
 */
export function getManagedSiteAdminConfig(
  preferences: UserPreferences,
): ManagedSiteAdminConfig | null {
  const siteType = getManagedSiteType(preferences)
  return getManagedSiteAdminConfigForType(preferences, siteType)
}

/**
 * Extracts a managed-site admin config for an explicit target site type.
 */
export function getManagedSiteAdminConfigForType(
  preferences: UserPreferences,
  siteType: ManagedSiteType,
): ManagedSiteAdminConfig | null {
  const runtimeConfig = resolveManagedSiteRuntimeConfigForType(
    preferences,
    siteType,
  )
  return runtimeConfig ? getManagedSiteLegacyAdminConfig(runtimeConfig) : null
}

/**
 * Gets the current managed site type from user preferences.
 */
export function getManagedSiteType(prefs: UserPreferences): ManagedSiteType {
  return prefs.managedSiteType || SITE_TYPES.NEW_API
}

/**
 * Whether the managed-site provider can reliably find channels by normalized
 * base URL for non-mutating review/navigation flows.
 */
export function supportsManagedSiteBaseUrlChannelLookup(
  siteType: ManagedSiteType,
): boolean {
  return siteType !== SITE_TYPES.VELOERA
}

/**
 * Whether the managed-site provider supports reading upstream models and
 * writing them back to channel definitions through the model-sync executor.
 * Contract: AxonHub and Claude Code Hub expose dedicated admin integrations
 * without the One API/New API channel model required by model sync.
 * Sources: https://github.com/looplj/axonhub and
 * https://github.com/ding113/claude-code-hub
 */
export function supportsManagedSiteModelSync(
  siteType: ManagedSiteType,
): boolean {
  return (
    siteType === SITE_TYPES.NEW_API ||
    siteType === SITE_TYPES.VELOERA ||
    siteType === SITE_TYPES.DONE_HUB ||
    siteType === SITE_TYPES.OCTOPUS
  )
}

/**
 * Returns both the selected managed site type and its corresponding i18n messages key.
 */
export function getManagedSiteContext(prefs: UserPreferences): {
  siteType: ManagedSiteType
  messagesKey: ManagedSiteMessagesKey
} {
  const siteType = getManagedSiteType(prefs)
  return getManagedSiteContextForType(siteType)
}

/**
 * Returns managed-site UI + i18n context for an explicit site type.
 */
export function getManagedSiteContextForType(siteType: ManagedSiteType): {
  siteType: ManagedSiteType
  messagesKey: ManagedSiteMessagesKey
} {
  return {
    siteType,
    messagesKey: getManagedSiteMessagesKeyFromSiteType(siteType),
  }
}

/**
 * Enumerates fully configured managed-site targets that can be used for
 * cross-site operations such as channel migration.
 */
export function getManagedSiteTargetOptions(
  preferences: UserPreferences,
  options?: {
    excludeSiteTypes?: ManagedSiteType[]
  },
): ManagedSiteTargetOption[] {
  const excluded = new Set(options?.excludeSiteTypes ?? [])
  const siteTypes: ManagedSiteType[] = [
    SITE_TYPES.NEW_API,
    SITE_TYPES.VELOERA,
    SITE_TYPES.DONE_HUB,
    SITE_TYPES.OCTOPUS,
    SITE_TYPES.AXON_HUB,
    SITE_TYPES.CLAUDE_CODE_HUB,
  ]

  return siteTypes
    .filter((siteType) => !excluded.has(siteType))
    .map((siteType) => {
      const config = getManagedSiteAdminConfigForType(preferences, siteType)
      if (!config) return null

      return {
        siteType,
        labelKey: getManagedSiteLabelKey(siteType),
        messagesKey: getManagedSiteMessagesKeyFromSiteType(siteType),
        config,
      } satisfies ManagedSiteTargetOption
    })
    .filter((item): item is ManagedSiteTargetOption => item !== null)
}

/**
 * Returns true when a managed-site channel key can be used directly as a real
 * credential rather than a masked inventory placeholder.
 */
export function hasUsableManagedSiteChannelKey(key?: string | null): boolean {
  const trimmed = key?.trim() ?? ""
  return hasUsableApiTokenKey(trimmed)
}

/**
 * Returns true when the source channel key must be hydrated from a detail or
 * verification flow before it can be reused safely.
 */
export function needsManagedSiteChannelKeyResolution(
  key?: string | null,
): boolean {
  return !hasUsableManagedSiteChannelKey(key)
}

/**
 * Returns the translated config-missing message for the selected managed-site backend.
 */
export function getManagedSiteConfigMissingMessage(
  t: TFunction,
  messagesKey: ManagedSiteMessagesKey,
) {
  switch (messagesKey) {
    case "donehub":
      return t("messages:donehub.configMissing")
    case "veloera":
      return t("messages:veloera.configMissing")
    case "octopus":
      return t("messages:octopus.configMissing")
    case "axonhub":
      return t("messages:axonhub.configMissing")
    case "claudecodehub":
      return t("messages:claudecodehub.configMissing")
    case "newapi":
    default:
      return t("messages:newapi.configMissing")
  }
}

/**
 * Returns the translated no-channels-to-sync message for the selected managed-site backend.
 */
export function getManagedSiteNoChannelsToSyncMessage(
  t: TFunction,
  messagesKey: ManagedSiteMessagesKey,
) {
  switch (messagesKey) {
    case "donehub":
      return t("messages:donehub.noChannelsToSync")
    case "veloera":
      return t("messages:veloera.noChannelsToSync")
    case "octopus":
      return t("messages:octopus.noChannelsToSync")
    case "axonhub":
      return t("messages:axonhub.noChannelsToSync")
    case "claudecodehub":
      return t("messages:claudecodehub.noChannelsToSync")
    case "newapi":
    default:
      return t("messages:newapi.noChannelsToSync")
  }
}

/**
 * Returns the translated unsupported model-sync message for the selected
 * managed-site backend.
 */
export function getManagedSiteUnsupportedModelSyncMessage(
  t: TFunction,
  messagesKey: ManagedSiteMessagesKey,
) {
  switch (messagesKey) {
    case "axonhub":
      return t("messages:axonhub.unsupportedModelSync")
    default:
      return t("messages:claudecodehub.unsupportedModelSync")
  }
}
