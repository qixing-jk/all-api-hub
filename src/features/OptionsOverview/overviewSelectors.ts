import type { ManagedSiteType } from "~/constants/siteType"
import {
  buildUnifiedApiGuidanceModel,
  getGatewayGuidanceImportableAccounts,
} from "~/features/UnifiedApiGuidance"
import type { FeatureGuidanceState } from "~/services/featureGuidance/featureGuidanceState"
import { hasValidManagedSiteConfig } from "~/services/managedSites/managedSiteService"
import type { UserPreferences } from "~/services/preferences/userPreferences"
import {
  SiteHealthStatus,
  type AccountStats,
  type DisplaySiteData,
  type SiteAccount,
} from "~/types"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import type { AutoCheckinStatus } from "~/types/autoCheckin"
import type {
  SiteAnnouncementRecord,
  SiteAnnouncementSiteState,
} from "~/types/siteAnnouncements"
import type { UsageHistoryStore } from "~/types/usageHistory"

import { buildAttentionItems } from "./attentionItems"
import { buildAutoCheckinPanel } from "./autoCheckinPanel"
import { buildAutomationOverview } from "./automationOverview"
import { buildConfigurationOverviewItems } from "./configurationOverviewItems"
import { buildStatusCards } from "./statusCards"
import type { OptionsOverviewViewModel } from "./types"
import { buildUsageSnapshot } from "./usageSnapshot"

interface BuildOptionsOverviewViewModelInput {
  accounts: SiteAccount[]
  displayData: DisplaySiteData[]
  accountStats: AccountStats
  apiCredentialProfiles: ApiCredentialProfile[]
  usageStore: UsageHistoryStore
  preferences: UserPreferences | null | undefined
  guidanceState?: FeatureGuidanceState | null
  managedSiteType: ManagedSiteType | undefined
  autoCheckinStatus: AutoCheckinStatus | null | undefined
  siteAnnouncementRecords: SiteAnnouncementRecord[]
  siteAnnouncementStatuses: SiteAnnouncementSiteState[]
  unifiedApiGuidanceDataAvailable?: boolean
  accountsDataAvailable?: boolean
  profilesDataAvailable?: boolean
}

/**
 * Builds the options overview dashboard view model from local-only data.
 */
export function buildOptionsOverviewViewModel(
  input: BuildOptionsOverviewViewModelInput,
): OptionsOverviewViewModel {
  const enabledAccounts = input.accounts.filter(
    (account) => account.disabled !== true,
  )
  const keyAccessibleAccounts = getGatewayGuidanceImportableAccounts(
    input.displayData,
  )
  const unifiedApiGuidanceDiagnostics = {
    enabledAccountCount: enabledAccounts.length,
    keyAccessibleAccountCount: keyAccessibleAccounts.length,
    profileCount: input.apiCredentialProfiles.length,
    gatewayConfigured: hasValidManagedSiteConfig(
      input.preferences ?? null,
      input.managedSiteType,
    ),
  }
  const gatewayGuidanceImportAccountId = keyAccessibleAccounts[0]?.id
  const problemAccounts = input.displayData.filter(
    (account) =>
      account.disabled !== true &&
      (account.health.status === SiteHealthStatus.Error ||
        account.health.status === SiteHealthStatus.Warning),
  )
  const usageSnapshot = buildUsageSnapshot(input.accountStats, input.usageStore)
  const attentionItems = buildAttentionItems({
    enabledAccountCount: enabledAccounts.length,
    profileCount: input.apiCredentialProfiles.length,
    problemAccounts,
    accountsDataAvailable: input.accountsDataAvailable,
    profilesDataAvailable: input.profilesDataAvailable,
  })
  const autoCheckinPanel = buildAutoCheckinPanel({
    preferences: input.preferences,
    status: input.autoCheckinStatus,
  })

  return {
    statusCards: buildStatusCards({
      enabledAccountCount: enabledAccounts.length,
      profileCount: input.apiCredentialProfiles.length,
      attentionCount: attentionItems.length,
      todayRequests: usageSnapshot.todayRequests,
      todayRequestsCoverage: usageSnapshot.todayRequestsCoverage,
      accountsDataAvailable: input.accountsDataAvailable,
      profilesDataAvailable: input.profilesDataAvailable,
    }),
    unifiedApiGuidance:
      input.unifiedApiGuidanceDataAvailable === false
        ? null
        : buildUnifiedApiGuidanceModel({
            enabledAccountCount:
              unifiedApiGuidanceDiagnostics.enabledAccountCount,
            keyAccessibleAccountCount:
              unifiedApiGuidanceDiagnostics.keyAccessibleAccountCount,
            profileCount: unifiedApiGuidanceDiagnostics.profileCount,
            preferences: input.preferences,
            guidanceState: input.guidanceState,
            managedSiteType: input.managedSiteType,
          }),
    unifiedApiGuidanceDiagnostics,
    gatewayGuidanceImportAccountId,
    attentionItems,
    autoCheckinPanel,
    automationOverview: buildAutomationOverview({
      autoCheckinPanel,
      preferences: input.preferences,
      managedSiteType: input.managedSiteType,
      siteAnnouncementRecords: input.siteAnnouncementRecords,
      siteAnnouncementStatuses: input.siteAnnouncementStatuses,
    }),
    usageSnapshot,
    configurationOverviewItems: buildConfigurationOverviewItems({
      enabledAccountCount: enabledAccounts.length,
      accounts: input.accounts,
      profileCount: input.apiCredentialProfiles.length,
      preferences: input.preferences,
      managedSiteType: input.managedSiteType,
      hasUsageData: usageSnapshot.hasUsageData,
    }),
  }
}
