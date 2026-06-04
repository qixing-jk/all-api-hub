import type { ManagedSiteType } from "~/constants/siteType"
import { resolveManagedSiteRuntimeConfigForType } from "~/services/managedSites/runtimeConfig"
import { supportsManagedSiteModelSync } from "~/services/managedSites/utils/managedSite"
import type { UserPreferences } from "~/services/preferences/userPreferences"
import type { SiteAccount } from "~/types"

import { OPTIONS_OVERVIEW_CONFIGURATION_STATUSES as CONFIGURATION_STATUSES } from "./ids"
import type { OptionsOverviewConfigurationStatus } from "./types"

export type ConfigurationStatus = OptionsOverviewConfigurationStatus

interface ManagedSiteConfigurationStatus {
  managedSiteConfigured: boolean
  modelSyncStatus: ConfigurationStatus
}

/**
 * Promotes child statuses into a single card-level status.
 */
export function summarizeConfigurationStatuses(
  statuses: ConfigurationStatus[],
): ConfigurationStatus {
  if (statuses.some((status) => status === CONFIGURATION_STATUSES.configured)) {
    return CONFIGURATION_STATUSES.configured
  }
  if (statuses.some((status) => status === CONFIGURATION_STATUSES.needsSetup)) {
    return CONFIGURATION_STATUSES.needsSetup
  }
  if (statuses.some((status) => status === CONFIGURATION_STATUSES.disabled)) {
    return CONFIGURATION_STATUSES.disabled
  }
  return CONFIGURATION_STATUSES.notApplicable
}

/**
 * Resolves whether auto check-in has enough local configuration to run.
 */
export function resolveAutoCheckinConfigurationStatus(input: {
  accounts: SiteAccount[]
  preferences: UserPreferences | null | undefined
}): ConfigurationStatus {
  if (input.preferences?.autoCheckin?.globalEnabled === false) {
    return CONFIGURATION_STATUSES.disabled
  }

  const hasReadyAccount = input.accounts.some(
    (account) =>
      account.disabled !== true && account.checkIn?.enableDetection === true,
  )

  return hasReadyAccount
    ? CONFIGURATION_STATUSES.configured
    : CONFIGURATION_STATUSES.needsSetup
}

/**
 * Resolves whether announcement polling is enabled and has accounts to poll.
 */
export function resolveSiteAnnouncementsConfigurationStatus(input: {
  enabledAccountCount: number
  preferences: UserPreferences | null | undefined
}): ConfigurationStatus {
  if (input.preferences?.siteAnnouncementNotifications?.enabled !== true) {
    return CONFIGURATION_STATUSES.disabled
  }

  return input.enabledAccountCount > 0
    ? CONFIGURATION_STATUSES.configured
    : CONFIGURATION_STATUSES.needsSetup
}

/**
 * Resolves whether usage analytics has sync enabled and local data to show.
 */
export function resolveUsageAnalyticsConfigurationStatus(input: {
  hasUsageData: boolean
  preferences: UserPreferences | null | undefined
}): ConfigurationStatus {
  if (input.preferences?.usageHistory?.enabled === false) {
    return CONFIGURATION_STATUSES.disabled
  }

  return input.hasUsageData
    ? CONFIGURATION_STATUSES.configured
    : CONFIGURATION_STATUSES.needsSetup
}

/**
 * Resolves whether balance history capture is enabled and has account scope.
 */
export function resolveBalanceHistoryConfigurationStatus(input: {
  enabledAccountCount: number
  preferences: UserPreferences | null | undefined
}): ConfigurationStatus {
  if (input.preferences?.balanceHistory?.enabled !== true) {
    return CONFIGURATION_STATUSES.disabled
  }

  return input.enabledAccountCount > 0
    ? CONFIGURATION_STATUSES.configured
    : CONFIGURATION_STATUSES.needsSetup
}

/**
 * Resolves managed-site connection and model-sync readiness together.
 */
export function resolveManagedSiteConfigurationStatus(input: {
  managedSiteType: ManagedSiteType | undefined
  preferences: UserPreferences | null | undefined
}): ManagedSiteConfigurationStatus {
  const managedSiteConfigured = isManagedSiteConfigurationComplete(
    input.managedSiteType,
    input.preferences,
  )
  const modelSyncSupported =
    !!input.managedSiteType &&
    supportsManagedSiteModelSync(input.managedSiteType)

  return {
    managedSiteConfigured,
    modelSyncStatus: !modelSyncSupported
      ? CONFIGURATION_STATUSES.notApplicable
      : managedSiteConfigured
        ? input.preferences?.managedSiteModelSync?.enabled === true
          ? CONFIGURATION_STATUSES.configured
          : CONFIGURATION_STATUSES.disabled
        : CONFIGURATION_STATUSES.needsSetup,
  }
}

/**
 * Checks the selected managed-site config against the provider's local contract.
 */
function isManagedSiteConfigurationComplete(
  managedSiteType: ManagedSiteType | undefined,
  preferences: UserPreferences | null | undefined,
) {
  if (!managedSiteType || !preferences) return false

  return Boolean(
    resolveManagedSiteRuntimeConfigForType(preferences, managedSiteType),
  )
}
