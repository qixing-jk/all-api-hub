import type { Dispatch, SetStateAction } from "react"

import { type ManagedSiteType } from "~/constants/siteType"
import {
  type RedemptionAssistPreferences,
  type TempWindowFallbackReminderPreferences,
  type ToolbarActionClickBehavior,
  type UserPreferences,
  type WebAiApiCheckPreferences,
} from "~/services/preferences/preferencesSchema"
import { type PreferenceWriteResult } from "~/services/preferences/preferencesStore"
import { type TempWindowFallbackPreferences } from "~/services/preferences/tempWindowFallbackPreferences"
import { type userPreferences } from "~/services/preferences/userPreferences"
import type {
  ActiveSortField,
  CurrencyType,
  DashboardTabType,
  SortOrder,
} from "~/types"
import type { AccountKeyAutoProvisionMode } from "~/types/accountKeyAutoProvisioning"
import type { AutoCheckinPreferences } from "~/types/autoCheckin"
import { type AxonHubConfig } from "~/types/axonHubConfig"
import { type ClaudeCodeHubConfig } from "~/types/claudeCodeHubConfig"
import { type BalanceHistoryPreferences } from "~/types/dailyBalanceHistory"
import { type GptLoadConfig } from "~/types/gptLoadConfig"
import type { LogLevel } from "~/types/logging"
import type { ModelRedirectPreferences } from "~/types/managedSiteModelRedirect"
import { type OmniRouteConfig } from "~/types/omnirouteConfig"
import { type SiteAnnouncementPreferences } from "~/types/siteAnnouncements"
import type { SortingPriorityConfig } from "~/types/sorting"
import { type Sub2ApiManagedSiteConfig } from "~/types/sub2apiManagedSiteConfig"
import { type TaskNotificationPreferences } from "~/types/taskNotifications"
import type { AppearanceUpdates, ThemeMode } from "~/types/theme"
import type { DeepPartial, PartialWithNested } from "~/types/utils"
import type { WebDAVSettings } from "~/types/webdav"

export type UserManagedSiteModelSyncConfig = NonNullable<
  UserPreferences["managedSiteModelSync"]
>

export type UserManagedSiteModelSyncConfigUpdate = PartialWithNested<
  UserManagedSiteModelSyncConfig,
  "rateLimit"
>

export type RuntimeMutationResponse = {
  success: boolean
  error?: string
  message?: string
  data?: unknown
}

export type PreferenceSaveOptions = {
  expectedLastUpdated?: number
}
type PreferenceWritePromise = Promise<PreferenceWriteResult>

export interface UserPreferencesContextType {
  preferences: UserPreferences
  isLoading: boolean
  activeTab: DashboardTabType
  currencyType: CurrencyType
  showTodayCashflow: boolean
  sortingPriorityConfig: SortingPriorityConfig
  sortField: ActiveSortField
  sortOrder: SortOrder
  autoRefresh: boolean
  refreshInterval: number
  minRefreshInterval: number
  refreshOnOpen: boolean
  actionClickBehavior: ToolbarActionClickBehavior
  openChangelogOnUpdate: boolean
  autoProvisionKeyOnAccountAdd: boolean
  autoProvisionKeyOnAccountAddMode: AccountKeyAutoProvisionMode
  autoFillCurrentSiteUrlOnAccountAdd: boolean
  warnOnDuplicateAccountAdd: boolean
  newApiBaseUrl: string
  newApiAdminToken: string
  newApiUserId: string
  newApiUsername: string
  newApiPassword: string
  newApiTotpSecret: string
  doneHubBaseUrl: string
  doneHubAdminToken: string
  doneHubUserId: string
  veloeraBaseUrl: string
  veloeraAdminToken: string
  veloeraUserId: string
  octopusBaseUrl: string
  octopusUsername: string
  octopusPassword: string
  axonHubBaseUrl: string
  axonHubEmail: string
  axonHubPassword: string
  claudeCodeHubBaseUrl: string
  claudeCodeHubAdminToken: string
  sub2ApiManagedSiteBaseUrl: string
  sub2ApiManagedSiteAdminToken: string
  omniRouteBaseUrl: string
  omniRouteToken: string
  gptLoadBaseUrl: string
  gptLoadManagementKey: string
  managedSiteType: ManagedSiteType
  cliProxyApiBaseUrl: string
  cliProxyApiManagementKey: string
  claudeCodeRouterBaseUrl: string
  claudeCodeRouterApiKey: string
  themeMode: ThemeMode
  loggingConsoleEnabled: boolean
  loggingLevel: LogLevel
  tempWindowFallback: TempWindowFallbackPreferences
  tempWindowFallbackReminder: TempWindowFallbackReminderPreferences
  taskNotifications: TaskNotificationPreferences
  siteAnnouncementNotifications: SiteAnnouncementPreferences
  updateActiveTab: (activeTab: DashboardTabType) => PreferenceWritePromise
  updateDefaultTab: (activeTab: DashboardTabType) => PreferenceWritePromise
  updateCurrencyType: (currencyType: CurrencyType) => PreferenceWritePromise
  updateShowTodayCashflow: (enabled: boolean) => PreferenceWritePromise
  updateSortConfig: (
    sortField: ActiveSortField,
    sortOrder: SortOrder,
  ) => PreferenceWritePromise
  updateSortingPriorityConfig: (
    sortingPriority: SortingPriorityConfig,
  ) => PreferenceWritePromise
  updateAutoRefresh: (enabled: boolean) => PreferenceWritePromise
  updateRefreshInterval: (interval: number) => PreferenceWritePromise
  updateMinRefreshInterval: (interval: number) => PreferenceWritePromise
  updateRefreshOnOpen: (enabled: boolean) => PreferenceWritePromise
  updateActionClickBehavior: (
    behavior: ToolbarActionClickBehavior,
  ) => PreferenceWritePromise
  updateOpenChangelogOnUpdate: (enabled: boolean) => PreferenceWritePromise
  updateAutoProvisionKeyOnAccountAdd: (
    enabled: boolean,
  ) => PreferenceWritePromise
  updateAutoProvisionKeyOnAccountAddMode: (
    mode: AccountKeyAutoProvisionMode,
  ) => PreferenceWritePromise
  updateAutoFillCurrentSiteUrlOnAccountAdd: (
    enabled: boolean,
  ) => PreferenceWritePromise
  updateWarnOnDuplicateAccountAdd: (enabled: boolean) => PreferenceWritePromise
  updateNewApiBaseUrl: (
    url: string,
    options?: PreferenceSaveOptions,
  ) => PreferenceWritePromise
  updateNewApiAdminToken: (
    token: string,
    options?: PreferenceSaveOptions,
  ) => PreferenceWritePromise
  updateNewApiUserId: (
    userId: string,
    options?: PreferenceSaveOptions,
  ) => PreferenceWritePromise
  updateNewApiUsername: (
    username: string,
    options?: PreferenceSaveOptions,
  ) => PreferenceWritePromise
  updateNewApiPassword: (
    password: string,
    options?: PreferenceSaveOptions,
  ) => PreferenceWritePromise
  updateNewApiTotpSecret: (
    totpSecret: string,
    options?: PreferenceSaveOptions,
  ) => PreferenceWritePromise
  updateDoneHubBaseUrl: (
    url: string,
    options?: PreferenceSaveOptions,
  ) => PreferenceWritePromise
  updateDoneHubAdminToken: (
    token: string,
    options?: PreferenceSaveOptions,
  ) => PreferenceWritePromise
  updateDoneHubUserId: (
    userId: string,
    options?: PreferenceSaveOptions,
  ) => PreferenceWritePromise
  updateVeloeraBaseUrl: (
    url: string,
    options?: PreferenceSaveOptions,
  ) => PreferenceWritePromise
  updateVeloeraAdminToken: (
    token: string,
    options?: PreferenceSaveOptions,
  ) => PreferenceWritePromise
  updateVeloeraUserId: (
    userId: string,
    options?: PreferenceSaveOptions,
  ) => PreferenceWritePromise
  updateOctopusBaseUrl: (
    url: string,
    options?: PreferenceSaveOptions,
  ) => PreferenceWritePromise
  updateOctopusUsername: (
    username: string,
    options?: PreferenceSaveOptions,
  ) => PreferenceWritePromise
  updateOctopusPassword: (
    password: string,
    options?: PreferenceSaveOptions,
  ) => PreferenceWritePromise
  updateOctopusConfig: (
    updates: Partial<NonNullable<UserPreferences["octopus"]>>,
    options?: PreferenceSaveOptions,
  ) => PreferenceWritePromise
  updateAxonHubBaseUrl: (
    url: string,
    options?: PreferenceSaveOptions,
  ) => PreferenceWritePromise
  updateAxonHubEmail: (
    email: string,
    options?: PreferenceSaveOptions,
  ) => PreferenceWritePromise
  updateAxonHubPassword: (
    password: string,
    options?: PreferenceSaveOptions,
  ) => PreferenceWritePromise
  updateAxonHubConfig: (
    updates: Partial<AxonHubConfig>,
    options?: PreferenceSaveOptions,
  ) => PreferenceWritePromise
  updateClaudeCodeHubBaseUrl: (
    url: string,
    options?: PreferenceSaveOptions,
  ) => PreferenceWritePromise
  updateClaudeCodeHubAdminToken: (
    token: string,
    options?: PreferenceSaveOptions,
  ) => PreferenceWritePromise
  updateClaudeCodeHubConfig: (
    updates: Partial<ClaudeCodeHubConfig>,
    options?: PreferenceSaveOptions,
  ) => PreferenceWritePromise
  updateSub2ApiManagedSiteBaseUrl: (
    url: string,
    options?: PreferenceSaveOptions,
  ) => PreferenceWritePromise
  updateSub2ApiManagedSiteAdminToken: (
    token: string,
    options?: PreferenceSaveOptions,
  ) => PreferenceWritePromise
  updateSub2ApiManagedSiteConfig: (
    updates: Partial<Sub2ApiManagedSiteConfig>,
    options?: PreferenceSaveOptions,
  ) => PreferenceWritePromise
  updateOmniRouteBaseUrl: (
    url: string,
    options?: PreferenceSaveOptions,
  ) => PreferenceWritePromise
  updateOmniRouteToken: (
    token: string,
    options?: PreferenceSaveOptions,
  ) => PreferenceWritePromise
  updateOmniRouteConfig: (
    updates: Partial<OmniRouteConfig>,
    options?: PreferenceSaveOptions,
  ) => PreferenceWritePromise
  updateManagedSiteType: (siteType: ManagedSiteType) => PreferenceWritePromise
  updateCliProxyApiBaseUrl: (
    url: string,
    options?: PreferenceSaveOptions,
  ) => PreferenceWritePromise
  updateCliProxyApiManagementKey: (
    key: string,
    options?: PreferenceSaveOptions,
  ) => PreferenceWritePromise
  updateClaudeCodeRouterBaseUrl: (
    url: string,
    options?: PreferenceSaveOptions,
  ) => PreferenceWritePromise
  updateClaudeCodeRouterApiKey: (
    key: string,
    options?: PreferenceSaveOptions,
  ) => PreferenceWritePromise
  updateAppearance: (updates: AppearanceUpdates) => PreferenceWritePromise
  updateThemeMode: (themeMode: ThemeMode) => PreferenceWritePromise
  updateLoggingConsoleEnabled: (enabled: boolean) => PreferenceWritePromise
  updateLoggingLevel: (level: LogLevel) => PreferenceWritePromise
  updateAutoCheckin: (
    updates: Partial<AutoCheckinPreferences>,
  ) => PreferenceWritePromise
  updateBalanceHistory: (
    updates: Partial<BalanceHistoryPreferences>,
  ) => PreferenceWritePromise
  updateNewApiModelSync: (
    updates: UserManagedSiteModelSyncConfigUpdate,
  ) => PreferenceWritePromise
  updateModelRedirect: (
    updates: Partial<ModelRedirectPreferences>,
  ) => PreferenceWritePromise
  updateRedemptionAssist: (
    updates: DeepPartial<RedemptionAssistPreferences>,
  ) => PreferenceWritePromise
  updateWebAiApiCheck: (
    updates: DeepPartial<WebAiApiCheckPreferences>,
  ) => PreferenceWritePromise
  updateWebdavSettings: (
    updates: DeepPartial<WebDAVSettings>,
    options?: PreferenceSaveOptions,
  ) => PreferenceWritePromise
  updateWebdavAutoSyncSettings: (
    updates: Pick<
      Partial<WebDAVSettings>,
      "autoSync" | "syncInterval" | "syncStrategy"
    >,
    options?: PreferenceSaveOptions,
  ) => Promise<RuntimeMutationResponse>
  updateTempWindowFallback: (
    updates: Partial<TempWindowFallbackPreferences>,
  ) => PreferenceWritePromise
  updateTempWindowFallbackReminder: (
    updates: Partial<TempWindowFallbackReminderPreferences>,
  ) => PreferenceWritePromise
  updateTaskNotifications: (
    updates: DeepPartial<TaskNotificationPreferences>,
  ) => PreferenceWritePromise
  updateSiteAnnouncementNotifications: (
    updates: Partial<SiteAnnouncementPreferences>,
  ) => Promise<RuntimeMutationResponse>
  resetToDefaults: () => PreferenceWritePromise
  resetDisplaySettings: () => PreferenceWritePromise
  resetAutoRefreshConfig: () => PreferenceWritePromise
  resetNewApiConfig: () => PreferenceWritePromise
  resetDoneHubConfig: () => PreferenceWritePromise
  resetVeloeraConfig: () => PreferenceWritePromise
  resetOctopusConfig: () => PreferenceWritePromise
  resetAxonHubConfig: () => PreferenceWritePromise
  resetClaudeCodeHubConfig: () => PreferenceWritePromise
  resetSub2ApiManagedSiteConfig: () => PreferenceWritePromise
  updateGptLoadBaseUrl: (
    baseUrl: string,
    options?: PreferenceSaveOptions,
  ) => PreferenceWritePromise
  updateGptLoadManagementKey: (
    managementKey: string,
    options?: PreferenceSaveOptions,
  ) => PreferenceWritePromise
  updateGptLoadConfig: (
    updates: Partial<GptLoadConfig>,
    options?: PreferenceSaveOptions,
  ) => PreferenceWritePromise
  resetGptLoadConfig: () => PreferenceWritePromise
  resetOmniRouteConfig: () => PreferenceWritePromise
  resetNewApiModelSyncConfig: () => PreferenceWritePromise
  resetCliProxyApiConfig: () => PreferenceWritePromise
  resetClaudeCodeRouterConfig: () => PreferenceWritePromise
  resetAutoCheckinConfig: () => PreferenceWritePromise
  resetRedemptionAssistConfig: () => PreferenceWritePromise
  resetWebAiApiCheckConfig: () => PreferenceWritePromise
  resetModelRedirectConfig: () => PreferenceWritePromise
  resetWebdavConfig: () => PreferenceWritePromise
  resetLoggingSettings: () => PreferenceWritePromise
  resetSortingPriorityConfig: () => PreferenceWritePromise
  resetTaskNotifications: () => PreferenceWritePromise
  loadPreferences: () => Promise<void>
}
// 2. 创建 Context

export type PreferenceMutationSession = {
  preferences: UserPreferences | null
  setPreferences: Dispatch<SetStateAction<UserPreferences | null>>
  loadPreferences: () => Promise<void>
  reloadPreferencesAndTrackSnapshots: (
    updates: DeepPartial<UserPreferences>,
  ) => Promise<void>
  applySuccessfulPreferenceWrite: (
    result: PreferenceWriteResult,
    updates?: DeepPartial<UserPreferences>,
  ) => UserPreferences | null
  persistPreferenceUpdates: (
    updates: Parameters<typeof userPreferences.savePreferences>[0],
    options?: PreferenceSaveOptions,
  ) => Promise<PreferenceWriteResult>
}
