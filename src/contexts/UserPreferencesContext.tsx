import type { ReactNode } from "react"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react"

import {
  DATA_TYPE_BALANCE,
  DATA_TYPE_CASHFLOW,
  DATA_TYPE_CONSUMPTION,
  DATA_TYPE_INCOME,
} from "~/constants"
import { SITE_TYPES, type ManagedSiteType } from "~/constants/siteType"
import { UI_CONSTANTS } from "~/constants/ui"
import {
  AutoRefreshMessageTypes,
  sendAutoRefreshMessage,
} from "~/services/accounts/autoRefreshMessaging"
import { sendAutoCheckinMessage } from "~/services/checkin/autoCheckin/messaging"
import { sendBalanceHistoryMessage } from "~/services/history/dailyBalanceHistory/messaging"
import { sendModelSyncMessage } from "~/services/models/modelSync/messaging"
import {
  DEFAULT_REDEMPTION_ASSIST_PREFERENCES,
  DEFAULT_WEB_AI_API_CHECK_PREFERENCES,
} from "~/services/preferences/contentScriptFeatureDefaults"
import {
  PreferencesMessageTypes,
  sendPreferencesMessage,
} from "~/services/preferences/messaging"
import {
  DEFAULT_PREFERENCES,
  TOOLBAR_ACTION_CLICK_BEHAVIORS,
  userPreferences,
  type PreferenceWriteResult,
  type RedemptionAssistPreferences,
  type TempWindowFallbackPreferences,
  type TempWindowFallbackReminderPreferences,
  type ToolbarActionClickBehavior,
  type UserPreferences,
  type WebAiApiCheckPreferences,
} from "~/services/preferences/userPreferences"
import { DEFAULT_SORTING_PRIORITY_CONFIG } from "~/services/preferences/utils/sortingPriority"
import { PRODUCT_ANALYTICS_ENTRYPOINTS } from "~/services/productAnalytics/contracts"
import { trackSettingsSnapshotEvents } from "~/services/productAnalytics/settings"
import {
  RedemptionAssistMessageTypes,
  sendRedemptionAssistMessage,
} from "~/services/redemption/redemptionAssistMessaging"
import {
  AutoCheckinMessageTypes,
  BalanceHistoryMessageTypes,
  ModelSyncMessageTypes,
  SiteAnnouncementsMessageTypes,
  WebdavAutoSyncMessageTypes,
} from "~/services/runtimeMessaging/messageTypes"
import { sendSiteAnnouncementsMessage } from "~/services/siteAnnouncements/messaging"
import { sendWebdavAutoSyncMessage } from "~/services/webdav/webdavAutoSyncMessaging"
import type {
  ActiveSortField,
  CurrencyType,
  DashboardTabType,
  SortOrder,
} from "~/types"
import { DEFAULT_ACCOUNT_AUTO_REFRESH } from "~/types/accountAutoRefresh"
import type { AutoCheckinPreferences } from "~/types/autoCheckin"
import {
  DEFAULT_AXON_HUB_CONFIG,
  type AxonHubConfig,
} from "~/types/axonHubConfig"
import {
  DEFAULT_CLAUDE_CODE_HUB_CONFIG,
  type ClaudeCodeHubConfig,
} from "~/types/claudeCodeHubConfig"
import {
  DEFAULT_BALANCE_HISTORY_PREFERENCES,
  type BalanceHistoryPreferences,
} from "~/types/dailyBalanceHistory"
import type { LogLevel } from "~/types/logging"
import type { ModelRedirectPreferences } from "~/types/managedSiteModelRedirect"
import {
  DEFAULT_SITE_ANNOUNCEMENT_PREFERENCES,
  normalizeSiteAnnouncementPreferences,
  type SiteAnnouncementPreferences,
} from "~/types/siteAnnouncements"
import type { SortingPriorityConfig } from "~/types/sorting"
import {
  normalizeTaskNotificationPreferences,
  type TaskNotificationPreferences,
} from "~/types/taskNotifications"
import type { ThemeMode } from "~/types/theme"
import type { DeepPartial } from "~/types/utils"
import type { WebDAVSettings } from "~/types/webdav"
import { deepOverride } from "~/utils"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("UserPreferencesContext")

type UserManagedSiteModelSyncConfig = NonNullable<
  UserPreferences["managedSiteModelSync"]
>

const DEFAULT_MANAGED_SITE_MODEL_SYNC_CONFIG =
  DEFAULT_PREFERENCES.managedSiteModelSync!

const DEFAULT_TEMP_WINDOW_FALLBACK_CONFIG =
  DEFAULT_PREFERENCES.tempWindowFallback!

type RuntimeMutationResponse = {
  success: boolean
  error?: string
  message?: string
  data?: unknown
}

export type PreferenceSaveOptions = {
  expectedLastUpdated?: number
}

type PreferenceWritePromise = Promise<PreferenceWriteResult>

const INVALID_RUNTIME_MUTATION_RESPONSE: RuntimeMutationResponse = {
  success: false,
  error: "Invalid response from background",
}

/**
 * Type guard to validate if an unknown value conforms to the RuntimeMutationResponse shape
 */
function isRuntimeMutationResponse(
  value: unknown,
): value is RuntimeMutationResponse {
  if (!value || typeof value !== "object") {
    return false
  }

  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.success === "boolean" &&
    (candidate.error === undefined || typeof candidate.error === "string") &&
    (candidate.message === undefined || typeof candidate.message === "string")
  )
}

/**
 * Normalizes an unknown value into a RuntimeMutationResponse
 */
function normalizeRuntimeMutationResponse(
  value: unknown,
): RuntimeMutationResponse {
  return isRuntimeMutationResponse(value)
    ? value
    : INVALID_RUNTIME_MUTATION_RESPONSE
}

/**
 * Persist a preference patch and only include the optimistic concurrency guard
 * when a caller is saving from a tracked local draft snapshot.
 */
function savePreferencesWithOptions(
  updates: Parameters<typeof userPreferences.savePreferences>[0],
  options?: PreferenceSaveOptions,
) {
  return typeof options?.expectedLastUpdated === "number"
    ? userPreferences.savePreferencesWithResult(updates, options)
    : userPreferences.savePreferencesWithResult(updates)
}

/**
 * Narrow an unknown runtime response payload to a persisted preferences snapshot.
 */
function isUserPreferencesSnapshot(value: unknown): value is UserPreferences {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as UserPreferences).lastUpdated === "number"
  )
}

/**
 * Emits option-page settings snapshots with the current persisted preferences.
 */
function trackOptionsSettingsSnapshots(
  preferences: UserPreferences,
  updates?: DeepPartial<UserPreferences>,
) {
  trackSettingsSnapshotEvents(
    preferences,
    PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    updates,
  )
}

/**
 * Fills legacy or partial preference snapshots before exposing them to UI and analytics.
 */
function normalizeContextPreferenceSnapshot(
  preferences: UserPreferences,
): UserPreferences {
  return {
    ...preferences,
    autoCheckin: deepOverride(
      DEFAULT_PREFERENCES.autoCheckin,
      preferences.autoCheckin ?? {},
    ),
    balanceHistory: deepOverride(
      DEFAULT_PREFERENCES.balanceHistory ?? DEFAULT_BALANCE_HISTORY_PREFERENCES,
      preferences.balanceHistory ?? {},
    ),
    managedSiteModelSync: deepOverride(
      DEFAULT_MANAGED_SITE_MODEL_SYNC_CONFIG,
      preferences.managedSiteModelSync ?? preferences.newApiModelSync ?? {},
    ) as UserManagedSiteModelSyncConfig,
    modelRedirect: deepOverride(
      DEFAULT_PREFERENCES.modelRedirect,
      preferences.modelRedirect ?? {},
    ),
    redemptionAssist: deepOverride(
      DEFAULT_PREFERENCES.redemptionAssist ??
        DEFAULT_REDEMPTION_ASSIST_PREFERENCES,
      preferences.redemptionAssist ?? {},
    ),
    webAiApiCheck: deepOverride(
      DEFAULT_PREFERENCES.webAiApiCheck ?? DEFAULT_WEB_AI_API_CHECK_PREFERENCES,
      preferences.webAiApiCheck ?? {},
    ),
    tempWindowFallback: deepOverride(
      DEFAULT_TEMP_WINDOW_FALLBACK_CONFIG,
      preferences.tempWindowFallback ?? {},
    ) as TempWindowFallbackPreferences,
    taskNotifications: normalizeTaskNotificationPreferences(
      preferences.taskNotifications,
    ),
    siteAnnouncementNotifications: normalizeSiteAnnouncementPreferences(
      preferences.siteAnnouncementNotifications,
    ),
  }
}

// 1. 定义 Context 的值类型
interface UserPreferencesContextType {
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
  managedSiteType: ManagedSiteType
  cliProxyBaseUrl: string
  cliProxyManagementKey: string
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
  updateManagedSiteType: (siteType: ManagedSiteType) => PreferenceWritePromise
  updateCliProxyBaseUrl: (
    url: string,
    options?: PreferenceSaveOptions,
  ) => PreferenceWritePromise
  updateCliProxyManagementKey: (
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
    updates: Partial<UserManagedSiteModelSyncConfig>,
  ) => PreferenceWritePromise
  updateModelRedirect: (
    updates: Partial<ModelRedirectPreferences>,
  ) => PreferenceWritePromise
  updateRedemptionAssist: (
    updates: Partial<RedemptionAssistPreferences>,
  ) => PreferenceWritePromise
  updateWebAiApiCheck: (
    updates: DeepPartial<WebAiApiCheckPreferences>,
  ) => PreferenceWritePromise
  updateWebdavSettings: (
    updates: Partial<WebDAVSettings>,
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
    updates: Partial<TaskNotificationPreferences>,
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
  resetNewApiModelSyncConfig: () => PreferenceWritePromise
  resetCliProxyConfig: () => PreferenceWritePromise
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
const UserPreferencesContext = createContext<
  UserPreferencesContextType | undefined
>(undefined)

/**
 * Top-level provider that loads persisted user preferences, exposes update
 * helpers, and keeps background scripts informed about configuration changes.
 *
 * `preferences` is the latest persisted snapshot for the UI. Editable settings
 * panels may keep local drafts, but `loadPreferences()` is the canonical way to
 * rehydrate the saved snapshot after external mutations such as import, restore,
 * or reset flows.
 */
export const UserPreferencesProvider = ({
  children,
}: {
  children: ReactNode
}) => {
  const [preferences, setPreferences] = useState<UserPreferences | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  /**
   * Fetch the latest preference snapshot from storage and hydrate local state.
   * Guards against repeated calls by toggling an `isLoading` flag.
   */
  const loadPreferences = useCallback(async () => {
    try {
      setIsLoading(true)
      const prefs = await userPreferences.getPreferences()
      const nextPreferences = normalizeContextPreferenceSnapshot(prefs)
      setPreferences(nextPreferences)
    } catch (error) {
      logger.error("加载用户偏好设置失败", error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const reloadPreferencesAndTrackSnapshots = useCallback(
    async (updates: DeepPartial<UserPreferences>) => {
      try {
        setIsLoading(true)
        const prefs = await userPreferences.getPreferences()
        const nextPreferences = normalizeContextPreferenceSnapshot(prefs)
        setPreferences(nextPreferences)
        trackOptionsSettingsSnapshots(nextPreferences, updates)
      } catch (error) {
        logger.error("加载用户偏好设置失败", error)
      } finally {
        setIsLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    void loadPreferences()
  }, [loadPreferences])

  const applySuccessfulPreferenceWrite = useCallback(
    (
      result: PreferenceWriteResult,
      updates?: DeepPartial<UserPreferences>,
    ): UserPreferences | null => {
      if (!result.ok) {
        return null
      }

      const nextPreferences = normalizeContextPreferenceSnapshot(
        result.preferences,
      )
      setPreferences(nextPreferences)
      trackOptionsSettingsSnapshots(nextPreferences, updates)
      return nextPreferences
    },
    [],
  )

  const persistPreferenceUpdates = useCallback(
    async (
      updates: Parameters<typeof userPreferences.savePreferences>[0],
      options?: PreferenceSaveOptions,
    ) => {
      const result = await savePreferencesWithOptions(updates, options)
      applySuccessfulPreferenceWrite(
        result,
        updates as DeepPartial<UserPreferences>,
      )
      return result
    },
    [applySuccessfulPreferenceWrite],
  )

  /**
   * Persist the currently visible balance tab and mirror it in React state.
   * @param activeTab - Consumption vs balance tab identifier.
   */
  const updateActiveTab = useCallback(
    async (activeTab: DashboardTabType) => {
      const result = await userPreferences.updateActiveTab(activeTab)
      applySuccessfulPreferenceWrite(result, { activeTab })
      return result
    },
    [applySuccessfulPreferenceWrite],
  )

  const updateActionClickBehavior = useCallback(
    async (behavior: ToolbarActionClickBehavior) => {
      const result = await userPreferences.savePreferences({
        actionClickBehavior: behavior,
      })
      if (
        applySuccessfulPreferenceWrite(result, {
          actionClickBehavior: behavior,
        })
      ) {
        void sendPreferencesMessage(
          PreferencesMessageTypes.UpdateActionClickBehavior,
          {
            behavior,
          },
        ).catch((error) => {
          logger.warn("Failed to notify action click behavior update", error)
        })
      }
      return result
    },
    [applySuccessfulPreferenceWrite],
  )

  /**
   * Enable/disable automatically showing the inline update log after updates.
   * @param enabled - When true, shows the update log on first UI open after update.
   */
  const updateOpenChangelogOnUpdate = useCallback(
    async (enabled: boolean) => {
      const result = await userPreferences.updateOpenChangelogOnUpdate(enabled)
      applySuccessfulPreferenceWrite(result, { openChangelogOnUpdate: enabled })
      return result
    },
    [applySuccessfulPreferenceWrite],
  )

  /**
   * Enable/disable automatically provisioning a default API key (token) after
   * successfully adding an account.
   * @param enabled - When true, runs token provisioning after account add.
   */
  const updateAutoProvisionKeyOnAccountAdd = useCallback(
    async (enabled: boolean) => {
      const result =
        await userPreferences.updateAutoProvisionKeyOnAccountAdd(enabled)
      applySuccessfulPreferenceWrite(result, {
        autoProvisionKeyOnAccountAdd: enabled,
      })
      return result
    },
    [applySuccessfulPreferenceWrite],
  )

  /**
   * Enable/disable automatically prefilling the add-account URL from the
   * current browser tab.
   * @param enabled - When true, add-account starts with the current site's origin.
   */
  const updateAutoFillCurrentSiteUrlOnAccountAdd = useCallback(
    async (enabled: boolean) => {
      const result =
        await userPreferences.updateAutoFillCurrentSiteUrlOnAccountAdd(enabled)
      applySuccessfulPreferenceWrite(result, {
        autoFillCurrentSiteUrlOnAccountAdd: enabled,
      })
      return result
    },
    [applySuccessfulPreferenceWrite],
  )

  /**
   * Enable/disable the duplicate-account add confirmation modal.
   * @param enabled - When true, prompts before adding an account whose site URL already exists.
   */
  const updateWarnOnDuplicateAccountAdd = useCallback(
    async (enabled: boolean) => {
      const result =
        await userPreferences.updateWarnOnDuplicateAccountAdd(enabled)
      applySuccessfulPreferenceWrite(result, {
        warnOnDuplicateAccountAdd: enabled,
      })
      return result
    },
    [applySuccessfulPreferenceWrite],
  )

  const resetClaudeCodeRouterConfig = useCallback(async () => {
    const result = await userPreferences.resetClaudeCodeRouterConfig()
    if (result.ok) {
      await loadPreferences()
    }
    return result
  }, [loadPreferences])

  /**
   * Update the CLI proxy base URL and merge it into the preference tree so
   * dependent features read the latest endpoint.
   */
  const updateCliProxyBaseUrl = useCallback(
    async (baseUrl: string, options?: PreferenceSaveOptions) => {
      return persistPreferenceUpdates(
        {
          cliProxy: { baseUrl },
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  /**
   * Persist the CLI proxy management key token used for authenticated calls.
   * @param managementKey - User-provided secret for the CLI proxy service.
   */
  const updateCliProxyManagementKey = useCallback(
    async (managementKey: string, options?: PreferenceSaveOptions) => {
      return persistPreferenceUpdates(
        {
          cliProxy: { managementKey },
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  const updateClaudeCodeRouterBaseUrl = useCallback(
    async (baseUrl: string, options?: PreferenceSaveOptions) => {
      return persistPreferenceUpdates(
        {
          claudeCodeRouter: { baseUrl },
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  const updateClaudeCodeRouterApiKey = useCallback(
    async (apiKey: string, options?: PreferenceSaveOptions) => {
      return persistPreferenceUpdates(
        {
          claudeCodeRouter: { apiKey },
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  const updateTempWindowFallbackReminder = useCallback(
    async (updates: Partial<TempWindowFallbackReminderPreferences>) => {
      const preferenceUpdates = {
        tempWindowFallbackReminder: updates,
      }
      const result = await userPreferences.savePreferences(preferenceUpdates)
      applySuccessfulPreferenceWrite(result, preferenceUpdates)
      return result
    },
    [applySuccessfulPreferenceWrite],
  )

  const updateDefaultTab = useCallback(
    async (activeTab: DashboardTabType) => {
      const result = await userPreferences.updateActiveTab(activeTab)
      applySuccessfulPreferenceWrite(result, { activeTab })
      return result
    },
    [applySuccessfulPreferenceWrite],
  )

  const updateCurrencyType = useCallback(
    async (currencyType: CurrencyType) => {
      const result = await userPreferences.updateCurrencyType(currencyType)
      applySuccessfulPreferenceWrite(result, { currencyType })
      return result
    },
    [applySuccessfulPreferenceWrite],
  )

  /**
   * Toggle whether today cashflow statistics are shown and fetched.
   *
   * When disabling, this also normalizes dependent selections so the UI does not
   * default to hidden today-based metrics (dashboard tab + sort field fallback).
   */
  const updateShowTodayCashflow = useCallback(
    async (enabled: boolean) => {
      const currentActiveTab = preferences?.activeTab ?? DATA_TYPE_CASHFLOW
      const currentSortField =
        preferences?.sortField ?? UI_CONSTANTS.SORT.DEFAULT_FIELD

      const nextActiveTab =
        enabled || currentActiveTab !== DATA_TYPE_CASHFLOW
          ? currentActiveTab
          : DATA_TYPE_BALANCE

      const nextSortField =
        enabled ||
        (currentSortField !== DATA_TYPE_CONSUMPTION &&
          currentSortField !== DATA_TYPE_INCOME)
          ? currentSortField
          : DATA_TYPE_BALANCE

      const updates: Partial<UserPreferences> = {
        showTodayCashflow: enabled,
        ...(nextActiveTab !== currentActiveTab
          ? { activeTab: nextActiveTab }
          : {}),
        ...(nextSortField !== currentSortField
          ? { sortField: nextSortField }
          : {}),
      }

      const result = await userPreferences.savePreferences(updates)
      applySuccessfulPreferenceWrite(result, updates)
      return result
    },
    [applySuccessfulPreferenceWrite, preferences],
  )

  const updateSortConfig = useCallback(
    async (sortField: ActiveSortField, sortOrder: SortOrder) => {
      const result = await userPreferences.updateSortConfig(
        sortField,
        sortOrder,
      )
      applySuccessfulPreferenceWrite(result, { sortField, sortOrder })
      return result
    },
    [applySuccessfulPreferenceWrite],
  )

  const updateSortingPriorityConfig = useCallback(
    async (sortingPriority: SortingPriorityConfig) => {
      const result =
        await userPreferences.setSortingPriorityConfig(sortingPriority)
      applySuccessfulPreferenceWrite(result, {
        sortingPriorityConfig: sortingPriority,
      })
      return result
    },
    [applySuccessfulPreferenceWrite],
  )

  const updateAutoRefresh = useCallback(
    async (enabled: boolean) => {
      const updates = {
        accountAutoRefresh: { enabled: enabled },
      }
      const result = await userPreferences.savePreferencesWithResult(updates)
      if (applySuccessfulPreferenceWrite(result, updates)) {
        void sendAutoRefreshMessage(AutoRefreshMessageTypes.UpdateSettings, {
          settings: updates,
        })
      }
      return result
    },
    [applySuccessfulPreferenceWrite],
  )

  const updateRefreshInterval = useCallback(
    async (interval: number) => {
      const updates = {
        accountAutoRefresh: { interval: interval },
      }
      const result = await userPreferences.savePreferencesWithResult(updates)
      if (applySuccessfulPreferenceWrite(result, updates)) {
        void sendAutoRefreshMessage(AutoRefreshMessageTypes.UpdateSettings, {
          settings: updates,
        })
      }
      return result
    },
    [applySuccessfulPreferenceWrite],
  )

  const updateMinRefreshInterval = useCallback(
    async (minInterval: number) => {
      const updates = {
        accountAutoRefresh: { minInterval: minInterval },
      }
      const result = await userPreferences.savePreferencesWithResult(updates)
      if (applySuccessfulPreferenceWrite(result, updates)) {
        void sendAutoRefreshMessage(AutoRefreshMessageTypes.UpdateSettings, {
          settings: updates,
        })
      }
      return result
    },
    [applySuccessfulPreferenceWrite],
  )

  const updateRefreshOnOpen = useCallback(
    async (refreshOnOpen: boolean) => {
      const updates = {
        accountAutoRefresh: { refreshOnOpen: refreshOnOpen },
      }
      const result = await userPreferences.savePreferencesWithResult(updates)
      if (applySuccessfulPreferenceWrite(result, updates)) {
        void sendAutoRefreshMessage(AutoRefreshMessageTypes.UpdateSettings, {
          settings: updates,
        })
      }
      return result
    },
    [applySuccessfulPreferenceWrite],
  )

  const updateNewApiBaseUrl = useCallback(
    async (baseUrl: string, options?: PreferenceSaveOptions) => {
      return persistPreferenceUpdates(
        {
          newApi: { baseUrl },
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  const updateNewApiAdminToken = useCallback(
    async (adminToken: string, options?: PreferenceSaveOptions) => {
      return persistPreferenceUpdates(
        {
          newApi: { adminToken },
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  const updateNewApiUserId = useCallback(
    async (userId: string, options?: PreferenceSaveOptions) => {
      return persistPreferenceUpdates(
        {
          newApi: { userId },
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  const updateNewApiUsername = useCallback(
    async (username: string, options?: PreferenceSaveOptions) => {
      return persistPreferenceUpdates(
        {
          newApi: { username },
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  const updateNewApiPassword = useCallback(
    async (password: string, options?: PreferenceSaveOptions) => {
      return persistPreferenceUpdates(
        {
          newApi: { password },
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  const updateNewApiTotpSecret = useCallback(
    async (totpSecret: string, options?: PreferenceSaveOptions) => {
      return persistPreferenceUpdates(
        {
          newApi: { totpSecret },
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  const updateDoneHubBaseUrl = useCallback(
    async (baseUrl: string, options?: PreferenceSaveOptions) => {
      return persistPreferenceUpdates(
        {
          doneHub: { baseUrl },
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  const updateDoneHubAdminToken = useCallback(
    async (adminToken: string, options?: PreferenceSaveOptions) => {
      return persistPreferenceUpdates(
        {
          doneHub: { adminToken },
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  const updateDoneHubUserId = useCallback(
    async (userId: string, options?: PreferenceSaveOptions) => {
      return persistPreferenceUpdates(
        {
          doneHub: { userId },
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  const updateVeloeraBaseUrl = useCallback(
    async (baseUrl: string, options?: PreferenceSaveOptions) => {
      return persistPreferenceUpdates(
        {
          veloera: { baseUrl },
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  const updateVeloeraAdminToken = useCallback(
    async (adminToken: string, options?: PreferenceSaveOptions) => {
      return persistPreferenceUpdates(
        {
          veloera: { adminToken },
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  const updateVeloeraUserId = useCallback(
    async (userId: string, options?: PreferenceSaveOptions) => {
      return persistPreferenceUpdates(
        {
          veloera: { userId },
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  const updateOctopusBaseUrl = useCallback(
    async (baseUrl: string, options?: PreferenceSaveOptions) => {
      return persistPreferenceUpdates(
        {
          octopus: { baseUrl },
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  const updateOctopusUsername = useCallback(
    async (username: string, options?: PreferenceSaveOptions) => {
      return persistPreferenceUpdates(
        {
          octopus: { username },
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  const updateOctopusPassword = useCallback(
    async (password: string, options?: PreferenceSaveOptions) => {
      return persistPreferenceUpdates(
        {
          octopus: { password },
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  const updateOctopusConfig = useCallback(
    async (
      updates: Partial<NonNullable<UserPreferences["octopus"]>>,
      options?: PreferenceSaveOptions,
    ) => {
      return persistPreferenceUpdates(
        {
          octopus: updates,
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  const updateAxonHubBaseUrl = useCallback(
    async (baseUrl: string, options?: PreferenceSaveOptions) => {
      return persistPreferenceUpdates(
        {
          axonHub: { baseUrl },
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  const updateAxonHubEmail = useCallback(
    async (email: string, options?: PreferenceSaveOptions) => {
      return persistPreferenceUpdates(
        {
          axonHub: { email },
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  const updateAxonHubPassword = useCallback(
    async (password: string, options?: PreferenceSaveOptions) => {
      return persistPreferenceUpdates(
        {
          axonHub: { password },
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  const updateAxonHubConfig = useCallback(
    async (
      updates: Partial<AxonHubConfig>,
      options?: PreferenceSaveOptions,
    ) => {
      return persistPreferenceUpdates(
        {
          axonHub: updates,
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  const updateClaudeCodeHubBaseUrl = useCallback(
    async (baseUrl: string, options?: PreferenceSaveOptions) => {
      return persistPreferenceUpdates(
        {
          claudeCodeHub: { baseUrl },
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  const updateClaudeCodeHubAdminToken = useCallback(
    async (adminToken: string, options?: PreferenceSaveOptions) => {
      return persistPreferenceUpdates(
        {
          claudeCodeHub: { adminToken },
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  const updateClaudeCodeHubConfig = useCallback(
    async (
      updates: Partial<ClaudeCodeHubConfig>,
      options?: PreferenceSaveOptions,
    ) => {
      return persistPreferenceUpdates(
        {
          claudeCodeHub: updates,
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  const updateManagedSiteType = useCallback(
    async (siteType: ManagedSiteType) => {
      const result = await userPreferences.updateManagedSiteType(siteType)
      applySuccessfulPreferenceWrite(result, { managedSiteType: siteType })
      return result
    },
    [applySuccessfulPreferenceWrite],
  )

  const updateThemeMode = useCallback(
    async (themeMode: ThemeMode) => {
      const result = await userPreferences.savePreferences({ themeMode })
      applySuccessfulPreferenceWrite(result, { themeMode })
      return result
    },
    [applySuccessfulPreferenceWrite],
  )

  const updateLoggingConsoleEnabled = useCallback(
    async (enabled: boolean) => {
      const updates = { logging: { consoleEnabled: enabled } }
      const result = await userPreferences.updateLoggingPreferences({
        consoleEnabled: enabled,
      })
      applySuccessfulPreferenceWrite(result, updates)
      return result
    },
    [applySuccessfulPreferenceWrite],
  )

  const updateLoggingLevel = useCallback(
    async (level: LogLevel) => {
      const updates = { logging: { level } }
      const result = await userPreferences.updateLoggingPreferences({ level })
      applySuccessfulPreferenceWrite(result, updates)
      return result
    },
    [applySuccessfulPreferenceWrite],
  )

  const updateAutoCheckin = useCallback(
    async (updates: Partial<AutoCheckinPreferences>) => {
      const preferenceUpdates = {
        autoCheckin: updates,
      }
      const result =
        await userPreferences.savePreferencesWithResult(preferenceUpdates)

      if (applySuccessfulPreferenceWrite(result, preferenceUpdates)) {
        // Notify background to update alarm
        void sendAutoCheckinMessage(AutoCheckinMessageTypes.UpdateSettings, {
          settings: updates,
        })
      }
      return result
    },
    [applySuccessfulPreferenceWrite],
  )

  const updateBalanceHistory = useCallback(
    async (updates: Partial<BalanceHistoryPreferences>) => {
      const preferenceUpdates = {
        balanceHistory: updates,
      }
      const result =
        await userPreferences.savePreferencesWithResult(preferenceUpdates)

      if (applySuccessfulPreferenceWrite(result, preferenceUpdates)) {
        void sendBalanceHistoryMessage(
          BalanceHistoryMessageTypes.UpdateSettings,
          {
            settings: updates,
          },
        )
      }

      return result
    },
    [applySuccessfulPreferenceWrite],
  )

  const updateNewApiModelSync = useCallback(
    async (updates: Partial<UserManagedSiteModelSyncConfig>) => {
      const preferenceUpdates = {
        managedSiteModelSync: updates,
      }
      const result =
        await userPreferences.savePreferencesWithResult(preferenceUpdates)

      if (applySuccessfulPreferenceWrite(result, preferenceUpdates)) {
        // Notify background to update alarm
        void sendModelSyncMessage(ModelSyncMessageTypes.UpdateSettings, {
          settings: updates,
        })
      }
      return result
    },
    [applySuccessfulPreferenceWrite],
  )

  const updateModelRedirect = useCallback(
    async (updates: Partial<ModelRedirectPreferences>) => {
      const preferenceUpdates = {
        modelRedirect: updates,
      }
      const result =
        await userPreferences.savePreferencesWithResult(preferenceUpdates)
      applySuccessfulPreferenceWrite(result, preferenceUpdates)
      return result
    },
    [applySuccessfulPreferenceWrite],
  )

  const updateRedemptionAssist = useCallback(
    async (updates: Partial<RedemptionAssistPreferences>) => {
      const preferenceUpdates = {
        redemptionAssist: updates,
      }
      const result =
        await userPreferences.savePreferencesWithResult(preferenceUpdates)

      if (applySuccessfulPreferenceWrite(result, preferenceUpdates)) {
        void sendRedemptionAssistMessage(
          RedemptionAssistMessageTypes.UpdateSettings,
          {
            settings: updates,
          },
        )

        const shouldRefreshContextMenus =
          typeof updates.contextMenu?.enabled === "boolean" ||
          typeof updates.enabled === "boolean"

        if (shouldRefreshContextMenus) {
          void sendPreferencesMessage(
            PreferencesMessageTypes.RefreshContextMenus,
          )
        }
      }

      return result
    },
    [applySuccessfulPreferenceWrite],
  )

  const updateWebAiApiCheck = useCallback(
    async (updates: DeepPartial<WebAiApiCheckPreferences>) => {
      const preferenceUpdates = {
        webAiApiCheck: updates,
      }
      const result =
        await userPreferences.savePreferencesWithResult(preferenceUpdates)

      if (applySuccessfulPreferenceWrite(result, preferenceUpdates)) {
        const shouldRefreshContextMenus =
          typeof updates.contextMenu?.enabled === "boolean" ||
          typeof updates.enabled === "boolean"

        if (shouldRefreshContextMenus) {
          void sendPreferencesMessage(
            PreferencesMessageTypes.RefreshContextMenus,
          )
        }
      }

      return result
    },
    [applySuccessfulPreferenceWrite],
  )

  const updateWebdavSettings = useCallback(
    async (
      updates: Partial<WebDAVSettings>,
      options?: PreferenceSaveOptions,
    ) => {
      return persistPreferenceUpdates(
        {
          webdav: updates,
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  const updateWebdavAutoSyncSettings = useCallback(
    async (
      updates: Pick<
        Partial<WebDAVSettings>,
        "autoSync" | "syncInterval" | "syncStrategy"
      >,
      options?: PreferenceSaveOptions,
    ) => {
      const response = normalizeRuntimeMutationResponse(
        await sendWebdavAutoSyncMessage(
          WebdavAutoSyncMessageTypes.UpdateSettings,
          typeof options?.expectedLastUpdated === "number"
            ? {
                settings: updates,
                expectedLastUpdated: options.expectedLastUpdated,
              }
            : {
                settings: updates,
              },
        ),
      )

      if (response.success && isUserPreferencesSnapshot(response.data)) {
        setPreferences(response.data)
        trackOptionsSettingsSnapshots(response.data, { webdav: updates })
      } else if (response.success && preferences) {
        const next = deepOverride(preferences, { webdav: updates })
        setPreferences(next)
        trackOptionsSettingsSnapshots(next, { webdav: updates })
      }

      return response
    },
    [preferences],
  )

  const updateTempWindowFallback = useCallback(
    async (updates: Partial<TempWindowFallbackPreferences>) => {
      const preferenceUpdates = {
        tempWindowFallback: updates,
      }
      const result =
        await userPreferences.savePreferencesWithResult(preferenceUpdates)
      applySuccessfulPreferenceWrite(result, preferenceUpdates)
      return result
    },
    [applySuccessfulPreferenceWrite],
  )

  const updateTaskNotifications = useCallback(
    async (updates: Partial<TaskNotificationPreferences>) => {
      const preferenceUpdates = {
        taskNotifications: updates,
      }
      const result =
        await userPreferences.savePreferencesWithResult(preferenceUpdates)
      applySuccessfulPreferenceWrite(result, preferenceUpdates)
      return result
    },
    [applySuccessfulPreferenceWrite],
  )

  const updateSiteAnnouncementNotifications = useCallback(
    async (updates: Partial<SiteAnnouncementPreferences>) => {
      const response = normalizeRuntimeMutationResponse(
        await sendSiteAnnouncementsMessage(
          SiteAnnouncementsMessageTypes.UpdatePreferences,
          {
            settings: updates,
          },
        ),
      )

      if (response.success && isUserPreferencesSnapshot(response.data)) {
        const nextPreferences = {
          ...response.data,
          siteAnnouncementNotifications: normalizeSiteAnnouncementPreferences(
            response.data.siteAnnouncementNotifications,
          ),
        }
        setPreferences(nextPreferences)
        trackOptionsSettingsSnapshots(nextPreferences, {
          siteAnnouncementNotifications: updates,
        })
      } else if (response.success) {
        if (preferences) {
          const next = {
            ...preferences,
            siteAnnouncementNotifications: normalizeSiteAnnouncementPreferences(
              deepOverride(
                preferences.siteAnnouncementNotifications ??
                  DEFAULT_SITE_ANNOUNCEMENT_PREFERENCES,
                updates,
              ),
            ),
            lastUpdated: Date.now(),
          }
          setPreferences(next)
          trackOptionsSettingsSnapshots(next, {
            siteAnnouncementNotifications: updates,
          })
        }
      }

      return response
    },
    [preferences],
  )
  const resetToDefaults = useCallback(async () => {
    const result = await userPreferences.resetToDefaults()
    if (result.ok) {
      await loadPreferences()

      // Notify all background services about the reset
      const defaults = DEFAULT_PREFERENCES
      trackOptionsSettingsSnapshots(defaults)

      // Notify auto-refresh service
      void sendAutoRefreshMessage(AutoRefreshMessageTypes.UpdateSettings, {
        settings: { accountAutoRefresh: defaults.accountAutoRefresh },
      })

      // Notify auto-checkin service
      if (defaults.autoCheckin) {
        void sendAutoCheckinMessage(AutoCheckinMessageTypes.UpdateSettings, {
          settings: defaults.autoCheckin,
        })
      }

      // Notify New API model sync service
      if (defaults.managedSiteModelSync) {
        void sendModelSyncMessage(ModelSyncMessageTypes.UpdateSettings, {
          settings: defaults.managedSiteModelSync,
        })
      }

      if (defaults.balanceHistory) {
        void sendBalanceHistoryMessage(
          BalanceHistoryMessageTypes.UpdateSettings,
          {
            settings: defaults.balanceHistory,
          },
        )
      }

      if (defaults.redemptionAssist) {
        void sendRedemptionAssistMessage(
          RedemptionAssistMessageTypes.UpdateSettings,
          {
            settings: defaults.redemptionAssist,
          },
        )
      }

      if (defaults.webdav) {
        void sendWebdavAutoSyncMessage(
          WebdavAutoSyncMessageTypes.UpdateSettings,
          {
            settings: {
              autoSync: defaults.webdav.autoSync,
              syncInterval: defaults.webdav.syncInterval,
              syncStrategy: defaults.webdav.syncStrategy,
            },
          },
        )
      }

      if (defaults.siteAnnouncementNotifications) {
        void sendSiteAnnouncementsMessage(
          SiteAnnouncementsMessageTypes.UpdatePreferences,
          {
            settings: defaults.siteAnnouncementNotifications,
          },
        )
      }

      void sendPreferencesMessage(PreferencesMessageTypes.RefreshContextMenus)
    }
    return result
  }, [loadPreferences])

  const resetDisplaySettings = useCallback(async () => {
    const result = await userPreferences.resetDisplaySettings()
    if (result.ok) {
      applySuccessfulPreferenceWrite(result, {
        activeTab: DEFAULT_PREFERENCES.activeTab,
        currencyType: DEFAULT_PREFERENCES.currencyType,
        showTodayCashflow: DEFAULT_PREFERENCES.showTodayCashflow,
      })
    }
    return result
  }, [applySuccessfulPreferenceWrite])

  const resetAutoRefreshConfig = useCallback(async () => {
    const result = await userPreferences.resetAutoRefreshConfig()
    if (
      applySuccessfulPreferenceWrite(result, {
        accountAutoRefresh: DEFAULT_PREFERENCES.accountAutoRefresh,
      })
    ) {
      const defaults = DEFAULT_PREFERENCES.accountAutoRefresh
      void sendAutoRefreshMessage(AutoRefreshMessageTypes.UpdateSettings, {
        settings: { accountAutoRefresh: defaults },
      })
    }
    return result
  }, [applySuccessfulPreferenceWrite])

  const resetNewApiConfig = useCallback(async () => {
    const result = await userPreferences.resetNewApiConfig()
    if (result.ok) {
      await reloadPreferencesAndTrackSnapshots({
        newApi: DEFAULT_PREFERENCES.newApi,
      })
    }
    return result
  }, [reloadPreferencesAndTrackSnapshots])

  const resetDoneHubConfig = useCallback(async () => {
    const result = await userPreferences.resetDoneHubConfig()
    if (result.ok) {
      await reloadPreferencesAndTrackSnapshots({
        doneHub: DEFAULT_PREFERENCES.doneHub,
      })
    }
    return result
  }, [reloadPreferencesAndTrackSnapshots])

  const resetVeloeraConfig = useCallback(async () => {
    const result = await userPreferences.resetVeloeraConfig()
    if (result.ok) {
      await reloadPreferencesAndTrackSnapshots({
        veloera: DEFAULT_PREFERENCES.veloera,
      })
    }
    return result
  }, [reloadPreferencesAndTrackSnapshots])

  const resetOctopusConfig = useCallback(async () => {
    const result = await userPreferences.resetOctopusConfig()
    if (result.ok) {
      await reloadPreferencesAndTrackSnapshots({
        octopus: DEFAULT_PREFERENCES.octopus,
      })
    }
    return result
  }, [reloadPreferencesAndTrackSnapshots])

  const resetAxonHubConfig = useCallback(async () => {
    const result = await userPreferences.resetAxonHubConfig()
    if (result.ok) {
      await reloadPreferencesAndTrackSnapshots({
        axonHub: DEFAULT_PREFERENCES.axonHub,
      })
    }
    return result
  }, [reloadPreferencesAndTrackSnapshots])

  const resetClaudeCodeHubConfig = useCallback(async () => {
    const result = await userPreferences.resetClaudeCodeHubConfig()
    if (result.ok) {
      await reloadPreferencesAndTrackSnapshots({
        claudeCodeHub: DEFAULT_PREFERENCES.claudeCodeHub,
      })
    }
    return result
  }, [reloadPreferencesAndTrackSnapshots])

  const resetNewApiModelSyncConfig = useCallback(async () => {
    const result = await userPreferences.resetNewApiModelSyncConfig()
    if (
      applySuccessfulPreferenceWrite(result, {
        managedSiteModelSync: DEFAULT_PREFERENCES.managedSiteModelSync,
      })
    ) {
      const defaults = DEFAULT_PREFERENCES.managedSiteModelSync
      if (defaults) {
        void sendModelSyncMessage(ModelSyncMessageTypes.UpdateSettings, {
          settings: defaults,
        })
      }
    }
    return result
  }, [applySuccessfulPreferenceWrite])

  const resetCliProxyConfig = useCallback(async () => {
    const result = await userPreferences.resetCliProxyConfig()
    if (result.ok) {
      await reloadPreferencesAndTrackSnapshots({
        cliProxy: DEFAULT_PREFERENCES.cliProxy,
      })
    }
    return result
  }, [reloadPreferencesAndTrackSnapshots])

  const resetAutoCheckinConfig = useCallback(async () => {
    const result = await userPreferences.resetAutoCheckinConfig()
    if (
      applySuccessfulPreferenceWrite(result, {
        autoCheckin: DEFAULT_PREFERENCES.autoCheckin,
      })
    ) {
      const defaults = DEFAULT_PREFERENCES.autoCheckin
      if (defaults) {
        void sendAutoCheckinMessage(AutoCheckinMessageTypes.UpdateSettings, {
          settings: defaults,
        })
      }
    }
    return result
  }, [applySuccessfulPreferenceWrite])

  const resetRedemptionAssistConfig = useCallback(async () => {
    const result = await userPreferences.resetRedemptionAssist()
    if (
      applySuccessfulPreferenceWrite(result, {
        redemptionAssist: DEFAULT_PREFERENCES.redemptionAssist,
      })
    ) {
      const defaults = DEFAULT_PREFERENCES.redemptionAssist
      if (defaults) {
        void sendRedemptionAssistMessage(
          RedemptionAssistMessageTypes.UpdateSettings,
          {
            settings: defaults,
          },
        )
      }
    }
    return result
  }, [applySuccessfulPreferenceWrite])

  const resetWebAiApiCheckConfig = useCallback(async () => {
    const result = await userPreferences.resetWebAiApiCheck()
    applySuccessfulPreferenceWrite(result, {
      webAiApiCheck: DEFAULT_PREFERENCES.webAiApiCheck,
    })
    return result
  }, [applySuccessfulPreferenceWrite])

  const resetModelRedirectConfig = useCallback(async () => {
    const result = await userPreferences.resetModelRedirectConfig()
    applySuccessfulPreferenceWrite(result, {
      modelRedirect: DEFAULT_PREFERENCES.modelRedirect,
    })
    return result
  }, [applySuccessfulPreferenceWrite])

  const resetWebdavConfig = useCallback(async () => {
    const result = await userPreferences.resetWebdavConfig()
    if (result.ok) {
      await reloadPreferencesAndTrackSnapshots({
        webdav: DEFAULT_PREFERENCES.webdav,
      })
    }
    return result
  }, [reloadPreferencesAndTrackSnapshots])

  const resetLoggingSettings = useCallback(async () => {
    const defaults = DEFAULT_PREFERENCES.logging
    const result = await userPreferences.updateLoggingPreferences(defaults)
    applySuccessfulPreferenceWrite(result, { logging: defaults })
    return result
  }, [applySuccessfulPreferenceWrite])

  const resetSortingPriorityConfig = useCallback(async () => {
    const result = await userPreferences.resetSortingPriorityConfig()
    applySuccessfulPreferenceWrite(result, {
      sortingPriorityConfig: DEFAULT_PREFERENCES.sortingPriorityConfig,
    })
    return result
  }, [applySuccessfulPreferenceWrite])

  const resetTaskNotifications = useCallback(async () => {
    const result = await userPreferences.resetTaskNotifications()
    applySuccessfulPreferenceWrite(result, {
      taskNotifications: DEFAULT_PREFERENCES.taskNotifications,
    })
    return result
  }, [applySuccessfulPreferenceWrite])

  useEffect(() => {
    if (!preferences) return

    const showTodayCashflow = preferences.showTodayCashflow ?? true
    if (showTodayCashflow) return

    const needsActiveTabFallback = preferences.activeTab === DATA_TYPE_CASHFLOW
    const needsSortFallback =
      preferences.sortField === DATA_TYPE_CONSUMPTION ||
      preferences.sortField === DATA_TYPE_INCOME

    if (!needsActiveTabFallback && !needsSortFallback) return

    const updates: Partial<UserPreferences> = {
      ...(needsActiveTabFallback ? { activeTab: DATA_TYPE_BALANCE } : {}),
      ...(needsSortFallback ? { sortField: DATA_TYPE_BALANCE } : {}),
    }

    void (async () => {
      const result = await userPreferences.savePreferences(updates)
      applySuccessfulPreferenceWrite(result, updates)
    })()
  }, [applySuccessfulPreferenceWrite, preferences])

  if (!preferences) {
    return null
  }

  const value = {
    preferences,
    isLoading,
    activeTab: preferences?.activeTab || DATA_TYPE_CASHFLOW,
    currencyType: preferences?.currencyType || "USD",
    showTodayCashflow: preferences?.showTodayCashflow ?? true,
    sortField:
      preferences?.sortField === undefined
        ? UI_CONSTANTS.SORT.DEFAULT_FIELD
        : preferences.sortField,
    sortOrder: preferences?.sortOrder || UI_CONSTANTS.SORT.DEFAULT_ORDER,
    sortingPriorityConfig:
      preferences?.sortingPriorityConfig || DEFAULT_SORTING_PRIORITY_CONFIG,
    autoRefresh:
      preferences?.accountAutoRefresh?.enabled ??
      DEFAULT_ACCOUNT_AUTO_REFRESH.enabled,
    refreshInterval:
      preferences?.accountAutoRefresh?.interval ??
      DEFAULT_ACCOUNT_AUTO_REFRESH.interval,
    minRefreshInterval:
      preferences?.accountAutoRefresh?.minInterval ??
      DEFAULT_ACCOUNT_AUTO_REFRESH.minInterval,
    refreshOnOpen:
      preferences?.accountAutoRefresh?.refreshOnOpen ??
      DEFAULT_ACCOUNT_AUTO_REFRESH.refreshOnOpen,
    actionClickBehavior:
      preferences?.actionClickBehavior ?? TOOLBAR_ACTION_CLICK_BEHAVIORS.Popup,
    openChangelogOnUpdate:
      preferences?.openChangelogOnUpdate ??
      DEFAULT_PREFERENCES.openChangelogOnUpdate ??
      true,
    autoProvisionKeyOnAccountAdd:
      preferences?.autoProvisionKeyOnAccountAdd ??
      DEFAULT_PREFERENCES.autoProvisionKeyOnAccountAdd ??
      false,
    autoFillCurrentSiteUrlOnAccountAdd:
      preferences?.autoFillCurrentSiteUrlOnAccountAdd ??
      DEFAULT_PREFERENCES.autoFillCurrentSiteUrlOnAccountAdd ??
      false,
    warnOnDuplicateAccountAdd:
      preferences?.warnOnDuplicateAccountAdd ??
      DEFAULT_PREFERENCES.warnOnDuplicateAccountAdd ??
      true,
    newApiBaseUrl: preferences?.newApi?.baseUrl || "",
    newApiAdminToken: preferences?.newApi?.adminToken || "",
    newApiUserId: preferences?.newApi?.userId || "",
    newApiUsername: preferences?.newApi?.username || "",
    newApiPassword: preferences?.newApi?.password || "",
    newApiTotpSecret: preferences?.newApi?.totpSecret || "",
    doneHubBaseUrl: preferences?.doneHub?.baseUrl || "",
    doneHubAdminToken: preferences?.doneHub?.adminToken || "",
    doneHubUserId: preferences?.doneHub?.userId || "",
    veloeraBaseUrl: preferences?.veloera?.baseUrl || "",
    veloeraAdminToken: preferences?.veloera?.adminToken || "",
    veloeraUserId: preferences?.veloera?.userId || "",
    octopusBaseUrl: preferences?.octopus?.baseUrl || "",
    octopusUsername: preferences?.octopus?.username || "",
    octopusPassword: preferences?.octopus?.password || "",
    axonHubBaseUrl:
      preferences?.axonHub?.baseUrl || DEFAULT_AXON_HUB_CONFIG.baseUrl,
    axonHubEmail: preferences?.axonHub?.email || DEFAULT_AXON_HUB_CONFIG.email,
    axonHubPassword:
      preferences?.axonHub?.password || DEFAULT_AXON_HUB_CONFIG.password,
    claudeCodeHubBaseUrl:
      preferences?.claudeCodeHub?.baseUrl ||
      DEFAULT_CLAUDE_CODE_HUB_CONFIG.baseUrl,
    claudeCodeHubAdminToken:
      preferences?.claudeCodeHub?.adminToken ||
      DEFAULT_CLAUDE_CODE_HUB_CONFIG.adminToken,
    managedSiteType: preferences?.managedSiteType || SITE_TYPES.NEW_API,
    cliProxyBaseUrl: preferences?.cliProxy?.baseUrl || "",
    cliProxyManagementKey: preferences?.cliProxy?.managementKey || "",
    claudeCodeRouterBaseUrl: preferences?.claudeCodeRouter?.baseUrl || "",
    claudeCodeRouterApiKey: preferences?.claudeCodeRouter?.apiKey || "",
    themeMode: preferences?.themeMode || "system",
    loggingConsoleEnabled:
      preferences?.logging?.consoleEnabled ??
      DEFAULT_PREFERENCES.logging.consoleEnabled,
    loggingLevel:
      preferences?.logging?.level ?? DEFAULT_PREFERENCES.logging.level,
    tempWindowFallback:
      preferences.tempWindowFallback ??
      (DEFAULT_PREFERENCES.tempWindowFallback as TempWindowFallbackPreferences),
    tempWindowFallbackReminder:
      preferences.tempWindowFallbackReminder ??
      (DEFAULT_PREFERENCES.tempWindowFallbackReminder as TempWindowFallbackReminderPreferences),
    taskNotifications: normalizeTaskNotificationPreferences(
      preferences.taskNotifications,
    ),
    siteAnnouncementNotifications: normalizeSiteAnnouncementPreferences(
      preferences.siteAnnouncementNotifications,
    ),
    updateActiveTab,
    updateDefaultTab,
    updateCurrencyType,
    updateShowTodayCashflow,
    updateSortConfig,
    updateSortingPriorityConfig,
    updateAutoRefresh,
    updateRefreshInterval,
    updateMinRefreshInterval,
    updateRefreshOnOpen,
    updateActionClickBehavior,
    updateOpenChangelogOnUpdate,
    updateAutoProvisionKeyOnAccountAdd,
    updateAutoFillCurrentSiteUrlOnAccountAdd,
    updateWarnOnDuplicateAccountAdd,
    updateNewApiBaseUrl,
    updateNewApiAdminToken,
    updateNewApiUserId,
    updateNewApiUsername,
    updateNewApiPassword,
    updateNewApiTotpSecret,
    updateDoneHubBaseUrl,
    updateDoneHubAdminToken,
    updateDoneHubUserId,
    updateVeloeraBaseUrl,
    updateVeloeraAdminToken,
    updateVeloeraUserId,
    updateOctopusBaseUrl,
    updateOctopusUsername,
    updateOctopusPassword,
    updateOctopusConfig,
    updateAxonHubBaseUrl,
    updateAxonHubEmail,
    updateAxonHubPassword,
    updateAxonHubConfig,
    updateClaudeCodeHubBaseUrl,
    updateClaudeCodeHubAdminToken,
    updateClaudeCodeHubConfig,
    updateManagedSiteType,
    updateCliProxyBaseUrl,
    updateCliProxyManagementKey,
    updateClaudeCodeRouterBaseUrl,
    updateClaudeCodeRouterApiKey,
    updateThemeMode,
    updateLoggingConsoleEnabled,
    updateLoggingLevel,
    updateAutoCheckin,
    updateBalanceHistory,
    updateNewApiModelSync,
    updateModelRedirect,
    updateRedemptionAssist,
    updateWebAiApiCheck,
    updateWebdavSettings,
    updateWebdavAutoSyncSettings,
    updateTempWindowFallback,
    updateTempWindowFallbackReminder,
    updateTaskNotifications,
    updateSiteAnnouncementNotifications,
    resetToDefaults,
    resetDisplaySettings,
    resetAutoRefreshConfig,
    resetNewApiConfig,
    resetDoneHubConfig,
    resetVeloeraConfig,
    resetOctopusConfig,
    resetAxonHubConfig,
    resetClaudeCodeHubConfig,
    resetNewApiModelSyncConfig,
    resetCliProxyConfig,
    resetClaudeCodeRouterConfig,
    resetAutoCheckinConfig,
    resetRedemptionAssistConfig,
    resetWebAiApiCheckConfig,
    resetModelRedirectConfig,
    resetWebdavConfig,
    resetLoggingSettings,
    resetSortingPriorityConfig,
    resetTaskNotifications,
    loadPreferences,
  }

  return (
    <UserPreferencesContext.Provider value={value}>
      {children}
    </UserPreferencesContext.Provider>
  )
}

// 4. 创建自定义 Hook
/**
 * Shorthand hook for consuming {@link UserPreferencesContext}. Throws when the
 * provider is missing to surface incorrect tree wiring during development.
 */
export const useUserPreferencesContext = () => {
  const context = useContext(UserPreferencesContext)
  if (!context) {
    throw new Error(
      "useUserPreferencesContext 必须在 UserPreferencesProvider 中使用",
    )
  }
  return context
}
