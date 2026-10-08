import { SITE_TYPES, type ManagedSiteType } from "~/constants/siteType"
import { getManagedSiteConfigRegistration } from "~/services/managedSites/configuration/configRegistration"
import {
  createDefaultSortingPriorityConfig,
  DEFAULT_SORTING_PRIORITY_CONFIG,
} from "~/services/preferences/utils/sortingPriority"
import {
  type ActiveSortField,
  type CurrencyType,
  type DashboardTabType,
  type SortOrder,
} from "~/types"
import { type AccountKeyAutoProvisionMode } from "~/types/accountKeyAutoProvisioning"
import { type AxonHubConfig } from "~/types/axonHubConfig"
import { type ClaudeCodeHubConfig } from "~/types/claudeCodeHubConfig"
import { type CliProxyApiConfig } from "~/types/cliProxyApiConfig"
import {
  DEFAULT_DONE_HUB_CONFIG,
  type DoneHubConfig,
} from "~/types/doneHubConfig"
import { type GptLoadConfig } from "~/types/gptLoadConfig"
import { type LoggingPreferences } from "~/types/logging"
import { type NewApiConfig } from "~/types/newApiConfig"
import { type OctopusConfig } from "~/types/octopusConfig"
import { type OmniRouteConfig } from "~/types/omnirouteConfig"
import { type SiteAnnouncementPreferences } from "~/types/siteAnnouncements"
import type { SortingPriorityConfig } from "~/types/sorting"
import { type Sub2ApiManagedSiteConfig } from "~/types/sub2apiManagedSiteConfig"
import { type TaskNotificationPreferences } from "~/types/taskNotifications"
import { type DeepPartial } from "~/types/utils"
import { type VeloeraConfig } from "~/types/veloeraConfig"
import { type WebDAVSettings } from "~/types/webdav"
import { normalizeAppLanguage } from "~/utils/i18n/language"

import { DEFAULT_PREFERENCES } from "./preferencesDefaults"
import { type WebAiApiCheckPreferences } from "./preferencesSchema"
import {
  PreferencesStore,
  type PreferenceWriteResult,
} from "./preferencesStore"

/** Domain preference commands share store-owned transaction and metadata rules. */
class UserPreferencesService extends PreferencesStore {
  /**
   * Update active tab preference.
   */
  async updateActiveTab(
    activeTab: DashboardTabType,
  ): Promise<PreferenceWriteResult> {
    return this.savePreferences({ activeTab })
  }

  /**
   * Enable/disable automatically showing the inline update log after updates.
   * @param enabled - When true, shows the update log on first UI open after update.
   */
  async updateOpenChangelogOnUpdate(
    enabled: boolean,
  ): Promise<PreferenceWriteResult> {
    return this.savePreferences({ openChangelogOnUpdate: enabled })
  }

  /**
   * Enable/disable automatically provisioning a default API key (token) after
   * successfully adding an account.
   * @param enabled - When true, runs token provisioning after account add.
   */
  async updateAutoProvisionKeyOnAccountAdd(
    enabled: boolean,
  ): Promise<PreferenceWriteResult> {
    return this.savePreferences({ autoProvisionKeyOnAccountAdd: enabled })
  }

  /** Updates the creation scope without enabling automatic provisioning. */
  async updateAutoProvisionKeyOnAccountAddMode(
    mode: AccountKeyAutoProvisionMode,
  ): Promise<PreferenceWriteResult> {
    return this.savePreferences({ autoProvisionKeyOnAccountAddMode: mode })
  }

  /**
   * Enable/disable automatically prefilling the add-account URL field from the
   * current browser tab.
   * @param enabled - When true, add-account starts with the current site's origin.
   */
  async updateAutoFillCurrentSiteUrlOnAccountAdd(
    enabled: boolean,
  ): Promise<PreferenceWriteResult> {
    return this.savePreferences({ autoFillCurrentSiteUrlOnAccountAdd: enabled })
  }

  /**
   * Enable/disable the duplicate-account add confirmation modal.
   * @param enabled - When true, adding an account whose site URL already exists
   * prompts for confirmation.
   */
  async updateWarnOnDuplicateAccountAdd(
    enabled: boolean,
  ): Promise<PreferenceWriteResult> {
    return this.savePreferences({ warnOnDuplicateAccountAdd: enabled })
  }

  /**
   * Update currency preference.
   */
  async updateCurrencyType(
    currencyType: CurrencyType,
  ): Promise<PreferenceWriteResult> {
    return this.savePreferences({ currencyType })
  }

  /**
   * Toggle whether "today cashflow" statistics are displayed and fetched.
   *
   * When disabled, expensive log pagination requests are skipped and today fields
   * are treated as zero during refresh.
   */
  async updateShowTodayCashflow(
    showTodayCashflow: boolean,
  ): Promise<PreferenceWriteResult> {
    return this.savePreferences({ showTodayCashflow })
  }

  /**
   * Update sort field/order.
   */
  async updateSortConfig(
    sortField: ActiveSortField,
    sortOrder: SortOrder,
  ): Promise<PreferenceWriteResult> {
    return this.savePreferences({ sortField, sortOrder })
  }

  /**
   * Toggle health status visibility.
   */
  async updateShowHealthStatus(
    showHealthStatus: boolean,
  ): Promise<PreferenceWriteResult> {
    return this.savePreferences({ showHealthStatus })
  }

  /**
   * Update WebDAV credentials/settings.
   */
  async updateWebdavSettings(settings: {
    provider?: WebDAVSettings["provider"]
    url?: string
    username?: string
    password?: string
    backupEncryptionEnabled?: boolean
    backupEncryptionPassword?: string
    syncData?: WebDAVSettings["syncData"]
    githubGist?: WebDAVSettings["githubGist"]
  }): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      webdav: settings,
    })
  }

  /**
   * Update WebDAV auto-sync settings.
   */
  async updateWebdavAutoSyncSettings(settings: {
    autoSync?: boolean
    syncInterval?: number
    syncStrategy?: WebDAVSettings["syncStrategy"]
  }): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      webdav: settings,
    })
  }

  async getSortingPriorityConfig(): Promise<SortingPriorityConfig> {
    const prefs = await this.getPreferences()
    // Migrations are already handled in getPreferences()
    return prefs.sortingPriorityConfig || DEFAULT_SORTING_PRIORITY_CONFIG
  }

  async setSortingPriorityConfig(
    config: SortingPriorityConfig,
  ): Promise<PreferenceWriteResult> {
    config.lastModified = Date.now()
    return this.savePreferences({ sortingPriorityConfig: config })
  }

  async resetSortingPriorityConfig(): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      sortingPriorityConfig: createDefaultSortingPriorityConfig(),
    })
  }

  /**
   * Get language preference.
   */
  async getLanguage(): Promise<string | undefined> {
    const preferences = await this.getPreferences()
    return normalizeAppLanguage(preferences.language) ?? preferences.language
  }

  /**
   * Set language preference.
   */
  async setLanguage(language: string): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      language: normalizeAppLanguage(language) ?? language,
    })
  }

  /**
   * Get logging preferences (console enablement + minimum level).
   */
  async getLoggingPreferences(): Promise<LoggingPreferences> {
    const preferences = await this.getPreferences()
    return preferences.logging
  }

  /**
   * Update logging preferences (deep merge).
   */
  async updateLoggingPreferences(
    updates: Partial<LoggingPreferences>,
  ): Promise<PreferenceWriteResult> {
    return this.savePreferences({ logging: updates })
  }

  /**
   * Reset display settings (currency + active tab).
   */
  async resetDisplaySettings(): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      activeTab: DEFAULT_PREFERENCES.activeTab,
      currencyType: DEFAULT_PREFERENCES.currencyType,
      showTodayCashflow: DEFAULT_PREFERENCES.showTodayCashflow,
    })
  }

  /**
   * Reset auto refresh config.
   */
  async resetAutoRefreshConfig(): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      accountAutoRefresh: DEFAULT_PREFERENCES.accountAutoRefresh,
    })
  }

  /**
   * Reset New API config.
   */
  async resetNewApiConfig(): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      newApi: DEFAULT_PREFERENCES.newApi,
    })
  }

  /**
   * Update Veloera config.
   */
  async updateVeloeraConfig(
    config: Partial<VeloeraConfig>,
  ): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      veloera: config,
    })
  }

  /**
   * Update Done Hub config.
   */
  async updateDoneHubConfig(
    config: Partial<DoneHubConfig>,
  ): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      doneHub: config,
    })
  }

  /**
   * Reset Veloera config.
   */
  async resetVeloeraConfig(): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      veloera: DEFAULT_PREFERENCES.veloera,
    })
  }

  /**
   * Reset Done Hub config.
   */
  async resetDoneHubConfig(): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      doneHub: DEFAULT_DONE_HUB_CONFIG,
    })
  }

  /**
   * Update Octopus config.
   */
  async updateOctopusConfig(
    config: Partial<OctopusConfig>,
  ): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      octopus: config,
    })
  }

  /**
   * Update AxonHub config.
   */
  async updateAxonHubConfig(
    config: Partial<AxonHubConfig>,
  ): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      axonHub: config,
    })
  }

  /**
   * Update Claude Code Hub config.
   */
  async updateClaudeCodeHubConfig(
    config: Partial<ClaudeCodeHubConfig>,
  ): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      claudeCodeHub: config,
    })
  }

  /** Update Sub2API managed-site Admin API Key config. */
  async updateSub2ApiManagedSiteConfig(
    config: Partial<Sub2ApiManagedSiteConfig>,
  ): Promise<PreferenceWriteResult> {
    return this.savePreferences({ sub2apiManagedSite: config })
  }

  /** Update OmniRoute managed-site config (deployment URL + access token). */
  async updateOmniRouteConfig(
    config: Partial<OmniRouteConfig>,
  ): Promise<PreferenceWriteResult> {
    return this.savePreferences({ omniroute: config })
  }

  /**
   * Reset Octopus config.
   */
  async resetOctopusConfig(): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      octopus: DEFAULT_PREFERENCES.octopus,
    })
  }

  /**
   * Reset AxonHub config.
   */
  async resetAxonHubConfig(): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      axonHub: DEFAULT_PREFERENCES.axonHub,
    })
  }

  /**
   * Reset Claude Code Hub config.
   */
  async resetClaudeCodeHubConfig(): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      claudeCodeHub: DEFAULT_PREFERENCES.claudeCodeHub,
    })
  }

  /** Reset Sub2API managed-site config. */
  async resetSub2ApiManagedSiteConfig(): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      sub2apiManagedSite: DEFAULT_PREFERENCES.sub2apiManagedSite,
    })
  }

  /** Reset OmniRoute managed-site config. */
  async resetOmniRouteConfig(): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      omniroute: DEFAULT_PREFERENCES.omniroute,
    })
  }

  /** Update gpt-load managed-site config (deployment URL + management key). */
  async updateGptLoadConfig(
    config: Partial<GptLoadConfig>,
  ): Promise<PreferenceWriteResult> {
    return this.savePreferences({ gptLoad: config })
  }

  /** Reset gpt-load managed-site config. */
  async resetGptLoadConfig(): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      gptLoad: DEFAULT_PREFERENCES.gptLoad,
    })
  }

  /**
   * Update managed site type (new-api, veloera, done-hub, or octopus).
   */
  async updateManagedSiteType(
    siteType: ManagedSiteType,
  ): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      managedSiteType: siteType,
    })
  }

  /**
   * Get managed site configuration based on current managedSiteType.
   */
  async getManagedSiteConfig(): Promise<{
    siteType: ManagedSiteType
    config:
      | NewApiConfig
      | DoneHubConfig
      | VeloeraConfig
      | OctopusConfig
      | AxonHubConfig
      | ClaudeCodeHubConfig
      | CliProxyApiConfig
      | Sub2ApiManagedSiteConfig
      | OmniRouteConfig
      | GptLoadConfig
  }> {
    const prefs = await this.getPreferences()
    const siteType = prefs.managedSiteType || SITE_TYPES.NEW_API
    const registration = getManagedSiteConfigRegistration(siteType)
    const config = registration?.select(prefs) ?? prefs.newApi
    return { siteType, config }
  }

  /**
   * Reset New API Model Sync config.
   */
  async resetNewApiModelSyncConfig(): Promise<PreferenceWriteResult> {
    return this.resetManagedSiteModelSyncConfig()
  }

  async resetManagedSiteModelSyncConfig(): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      managedSiteModelSync: DEFAULT_PREFERENCES.managedSiteModelSync,
    })
  }

  async resetCliProxyApiConfig(): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      cliProxyApi: DEFAULT_PREFERENCES.cliProxyApi,
    })
  }

  async resetClaudeCodeRouterConfig(): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      claudeCodeRouter: DEFAULT_PREFERENCES.claudeCodeRouter,
    })
  }

  /**
   * Reset auto check-in config.
   */
  async resetAutoCheckinConfig(): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      autoCheckin: DEFAULT_PREFERENCES.autoCheckin,
    })
  }

  /**
   * Reset model redirect config.
   */
  async resetModelRedirectConfig(): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      modelRedirect: DEFAULT_PREFERENCES.modelRedirect,
    })
  }

  /**
   * Reset redemption assist config.
   */
  async resetRedemptionAssist(): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      redemptionAssist: DEFAULT_PREFERENCES.redemptionAssist,
    })
  }

  /**
   * Reset Web AI API Check config.
   */
  async resetWebAiApiCheck(): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      webAiApiCheck: DEFAULT_PREFERENCES.webAiApiCheck,
    })
  }

  /**
   * Update Web AI API Check config from extension contexts without a React provider.
   */
  async updateWebAiApiCheck(
    updates: DeepPartial<WebAiApiCheckPreferences>,
  ): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      webAiApiCheck: updates,
    })
  }

  /**
   * Reset WebDAV config.
   */
  async resetWebdavConfig(): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      webdav: DEFAULT_PREFERENCES.webdav,
    })
  }

  /**
   * Update task-notification preferences.
   */
  async updateTaskNotifications(
    updates: DeepPartial<TaskNotificationPreferences>,
  ): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      taskNotifications: updates,
    })
  }

  /**
   * Reset task-notification preferences.
   */
  async resetTaskNotifications(): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      taskNotifications: DEFAULT_PREFERENCES.taskNotifications,
    })
  }

  /**
   * Update site-announcement notification preferences.
   */
  async updateSiteAnnouncementNotifications(
    updates: Partial<SiteAnnouncementPreferences>,
  ): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      siteAnnouncementNotifications: updates,
    })
  }
}
export const userPreferences = new UserPreferencesService()
