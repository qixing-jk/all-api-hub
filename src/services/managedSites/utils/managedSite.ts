import type { TFunction } from "i18next"

import { SITE_TYPES, type ManagedSiteType } from "~/constants/siteType"
import type {
  ManagedSiteLabelKey,
  ManagedSiteMessagesKey,
} from "~/services/accountSiteDefinitions/contracts"
import { getAccountSiteDefinition } from "~/services/accountSiteDefinitions/registry"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import type { UserPreferences } from "~/services/preferences/userPreferences"

/**
 * Returns the i18n key for the managed site label shown in UI.
 */
export function getManagedSiteLabelKey(
  siteType: ManagedSiteType,
): ManagedSiteLabelKey {
  return (
    getAccountSiteDefinition(siteType)?.managedResource?.labelKey ??
    "settings:managedSite.newApi"
  )
}

/**
 * Returns the translated managed-site label for the given site type.
 */
export function getManagedSiteLabel(t: TFunction, siteType: ManagedSiteType) {
  return t(getManagedSiteLabelKey(siteType))
}

/**
 * Returns the `messages` namespace key for the selected managed site type.
 */
export function getManagedSiteMessagesKeyFromSiteType(
  siteType: ManagedSiteType,
): ManagedSiteMessagesKey {
  return (
    getAccountSiteDefinition(siteType)?.managedResource?.messagesKey ?? "newapi"
  )
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
  return Boolean(getSiteTypeCapabilities(siteType).managedSites?.matching)
}

/** Whether the registered managed-site channel adapter supports model writes. */
export function supportsManagedSiteModelSync(
  siteType: ManagedSiteType,
): boolean {
  const models = getSiteTypeCapabilities(siteType).managedSites?.models
  return Boolean(models?.createSync || models?.updateModels)
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
    case "sub2api":
      return t("messages:sub2api.configMissing")
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
  siteType: ManagedSiteType,
) {
  return t("messages:managedSite.unsupportedModelSync", {
    siteName: getManagedSiteLabel(t, siteType),
  })
}
