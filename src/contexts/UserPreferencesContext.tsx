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
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { SITE_TYPES, type ManagedSiteType } from "~/constants/siteType"
import { UI_CONSTANTS } from "~/constants/ui"
import {
  DEFAULT_REDEMPTION_ASSIST_PREFERENCES,
  DEFAULT_WEB_AI_API_CHECK_PREFERENCES,
} from "~/services/preferences/contentScriptFeatureDefaults"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
  type RedemptionAssistPreferences,
  type TempWindowFallbackPreferences,
  type TempWindowFallbackReminderPreferences,
  type UserPreferences,
  type WebAiApiCheckPreferences,
} from "~/services/preferences/userPreferences"
import { DEFAULT_SORTING_PRIORITY_CONFIG } from "~/services/preferences/utils/sortingPriority"
import { PRODUCT_ANALYTICS_ENTRYPOINTS } from "~/services/productAnalytics/events"
import { trackSettingsSnapshotEvents } from "~/services/productAnalytics/settings"
import type {
  CurrencyType,
  DashboardTabType,
  SortField,
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
  DEFAULT_TASK_NOTIFICATION_PREFERENCES,
  normalizeTaskNotificationPreferences,
  type TaskNotificationPreferences,
} from "~/types/taskNotifications"
import type { ThemeMode } from "~/types/theme"
import type { DeepPartial } from "~/types/utils"
import type { WebDAVSettings } from "~/types/webdav"
import { deepOverride } from "~/utils"
import { sendRuntimeMessage } from "~/utils/browser/browserApi"
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

type PreferenceSaveOptions = {
  expectedLastUpdated?: number
}

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
  sortField: SortField
  sortOrder: SortOrder
  autoRefresh: boolean
  refreshInterval: number
  minRefreshInterval: number
  refreshOnOpen: boolean
  actionClickBehavior: "popup" | "sidepanel"
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

  updateActiveTab: (activeTab: DashboardTabType) => Promise<boolean>
  updateDefaultTab: (activeTab: DashboardTabType) => Promise<boolean>
  updateCurrencyType: (currencyType: CurrencyType) => Promise<boolean>
  updateShowTodayCashflow: (enabled: boolean) => Promise<boolean>
  updateSortConfig: (
    sortField: SortField,
    sortOrder: SortOrder,
  ) => Promise<boolean>
  updateSortingPriorityConfig: (
    sortingPriority: SortingPriorityConfig,
  ) => Promise<boolean>
  updateAutoRefresh: (enabled: boolean) => Promise<boolean>
  updateRefreshInterval: (interval: number) => Promise<boolean>
  updateMinRefreshInterval: (interval: number) => Promise<boolean>
  updateRefreshOnOpen: (enabled: boolean) => Promise<boolean>
  updateActionClickBehavior: (
    behavior: "popup" | "sidepanel",
  ) => Promise<boolean>
  updateOpenChangelogOnUpdate: (enabled: boolean) => Promise<boolean>
  updateAutoProvisionKeyOnAccountAdd: (enabled: boolean) => Promise<boolean>
  updateAutoFillCurrentSiteUrlOnAccountAdd: (
    enabled: boolean,
  ) => Promise<boolean>
  updateWarnOnDuplicateAccountAdd: (enabled: boolean) => Promise<boolean>
  updateNewApiBaseUrl: (
    url: string,
    options?: PreferenceSaveOptions,
  ) => Promise<boolean>
  updateNewApiAdminToken: (
    token: string,
    options?: PreferenceSaveOptions,
  ) => Promise<boolean>
  updateNewApiUserId: (
    userId: string,
    options?: PreferenceSaveOptions,
  ) => Promise<boolean>
  updateNewApiUsername: (
    username: string,
    options?: PreferenceSaveOptions,
  ) => Promise<boolean>
  updateNewApiPassword: (
    password: string,
    options?: PreferenceSaveOptions,
  ) => Promise<boolean>
  updateNewApiTotpSecret: (
    totpSecret: string,
    options?: PreferenceSaveOptions,
  ) => Promise<boolean>
  updateDoneHubBaseUrl: (
    url: string,
    options?: PreferenceSaveOptions,
  ) => Promise<boolean>
  updateDoneHubAdminToken: (
    token: string,
    options?: PreferenceSaveOptions,
  ) => Promise<boolean>
  updateDoneHubUserId: (
    userId: string,
    options?: PreferenceSaveOptions,
  ) => Promise<boolean>
  updateVeloeraBaseUrl: (
    url: string,
    options?: PreferenceSaveOptions,
  ) => Promise<boolean>
  updateVeloeraAdminToken: (
    token: string,
    options?: PreferenceSaveOptions,
  ) => Promise<boolean>
  updateVeloeraUserId: (
    userId: string,
    options?: PreferenceSaveOptions,
  ) => Promise<boolean>
  updateOctopusBaseUrl: (
    url: string,
    options?: PreferenceSaveOptions,
  ) => Promise<boolean>
  updateOctopusUsername: (
    username: string,
    options?: PreferenceSaveOptions,
  ) => Promise<boolean>
  updateOctopusPassword: (
    password: string,
    options?: PreferenceSaveOptions,
  ) => Promise<boolean>
  updateOctopusConfig: (
    updates: Partial<NonNullable<UserPreferences["octopus"]>>,
    options?: PreferenceSaveOptions,
  ) => Promise<boolean>
  updateAxonHubBaseUrl: (
    url: string,
    options?: PreferenceSaveOptions,
  ) => Promise<boolean>
  updateAxonHubEmail: (
    email: string,
    options?: PreferenceSaveOptions,
  ) => Promise<boolean>
  updateAxonHubPassword: (
    password: string,
    options?: PreferenceSaveOptions,
  ) => Promise<boolean>
  updateAxonHubConfig: (
    updates: Partial<AxonHubConfig>,
    options?: PreferenceSaveOptions,
  ) => Promise<boolean>
  updateClaudeCodeHubBaseUrl: (
    url: string,
    options?: PreferenceSaveOptions,
  ) => Promise<boolean>
  updateClaudeCodeHubAdminToken: (
    token: string,
    options?: PreferenceSaveOptions,
  ) => Promise<boolean>
  updateClaudeCodeHubConfig: (
    updates: Partial<ClaudeCodeHubConfig>,
    options?: PreferenceSaveOptions,
  ) => Promise<boolean>
  updateManagedSiteType: (siteType: ManagedSiteType) => Promise<boolean>
  updateCliProxyBaseUrl: (
    url: string,
    options?: PreferenceSaveOptions,
  ) => Promise<boolean>
  updateCliProxyManagementKey: (
    key: string,
    options?: PreferenceSaveOptions,
  ) => Promise<boolean>
  updateClaudeCodeRouterBaseUrl: (
    url: string,
    options?: PreferenceSaveOptions,
  ) => Promise<boolean>
  updateClaudeCodeRouterApiKey: (
    key: string,
    options?: PreferenceSaveOptions,
  ) => Promise<boolean>
  updateThemeMode: (themeMode: ThemeMode) => Promise<boolean>
  updateLoggingConsoleEnabled: (enabled: boolean) => Promise<boolean>
  updateLoggingLevel: (level: LogLevel) => Promise<boolean>
  updateAutoCheckin: (
    updates: Partial<AutoCheckinPreferences>,
  ) => Promise<boolean>
  updateBalanceHistory: (
    updates: Partial<BalanceHistoryPreferences>,
  ) => Promise<boolean>
  updateNewApiModelSync: (
    updates: Partial<UserManagedSiteModelSyncConfig>,
  ) => Promise<boolean>
  updateModelRedirect: (
    updates: Partial<ModelRedirectPreferences>,
  ) => Promise<boolean>
  updateRedemptionAssist: (
    updates: Partial<RedemptionAssistPreferences>,
  ) => Promise<boolean>
  updateWebAiApiCheck: (
    updates: Partial<WebAiApiCheckPreferences>,
  ) => Promise<boolean>
  updateWebdavSettings: (
    updates: Partial<WebDAVSettings>,
    options?: PreferenceSaveOptions,
  ) => Promise<boolean>
  updateWebdavAutoSyncSettings: (
    updates: Pick<
      Partial<WebDAVSettings>,
      "autoSync" | "syncInterval" | "syncStrategy"
    >,
    options?: PreferenceSaveOptions,
  ) => Promise<RuntimeMutationResponse>
  updateTempWindowFallback: (
    updates: Partial<TempWindowFallbackPreferences>,
  ) => Promise<boolean>
  updateTempWindowFallbackReminder: (
    updates: Partial<TempWindowFallbackReminderPreferences>,
  ) => Promise<boolean>
  updateTaskNotifications: (
    updates: Partial<TaskNotificationPreferences>,
  ) => Promise<boolean>
  updateSiteAnnouncementNotifications: (
    updates: Partial<SiteAnnouncementPreferences>,
  ) => Promise<boolean>
  resetToDefaults: () => Promise<boolean>
  resetDisplaySettings: () => Promise<boolean>
  resetAutoRefreshConfig: () => Promise<boolean>
  resetNewApiConfig: () => Promise<boolean>
  resetDoneHubConfig: () => Promise<boolean>
  resetVeloeraConfig: () => Promise<boolean>
  resetOctopusConfig: () => Promise<boolean>
  resetAxonHubConfig: () => Promise<boolean>
  resetClaudeCodeHubConfig: () => Promise<boolean>
  resetNewApiModelSyncConfig: () => Promise<boolean>
  resetCliProxyConfig: () => Promise<boolean>
  resetClaudeCodeRouterConfig: () => Promise<boolean>
  resetAutoCheckinConfig: () => Promise<boolean>
  resetRedemptionAssistConfig: () => Promise<boolean>
  resetWebAiApiCheckConfig: () => Promise<boolean>
  resetModelRedirectConfig: () => Promise<boolean>
  resetWebdavConfig: () => Promise<boolean>
  resetLoggingSettings: () => Promise<boolean>
  resetSortingPriorityConfig: () => Promise<boolean>
  resetTaskNotifications: () => Promise<boolean>
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
      setPreferences(prefs)
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

  const persistPreferenceUpdates = useCallback(
    async (
      updates: Parameters<typeof userPreferences.savePreferences>[0],
      options?: PreferenceSaveOptions,
    ) => {
      const savedPreferences = await savePreferencesWithOptions(
        updates,
        options,
      )
      if (savedPreferences) {
        const nextPreferences =
          normalizeContextPreferenceSnapshot(savedPreferences)
        setPreferences(nextPreferences)
        trackOptionsSettingsSnapshots(
          nextPreferences,
          updates as DeepPartial<UserPreferences>,
        )
        return true
      }
      return false
    },
    [],
  )

  /**
   * Persist the currently visible balance tab and mirror it in React state.
   * @param activeTab - Consumption vs balance tab identifier.
   */
  const updateActiveTab = useCallback(async (activeTab: DashboardTabType) => {
    const success = await userPreferences.updateActiveTab(activeTab)
    if (success) {
      setPreferences((prev) => (prev ? { ...prev, activeTab } : null))
    }
    return success
  }, [])

  const updateActionClickBehavior = useCallback(
    async (behavior: "popup" | "sidepanel") => {
      const success = await userPreferences.savePreferences({
        actionClickBehavior: behavior,
      })
      if (success) {
        setPreferences((prev) =>
          prev
            ? {
                ...prev,
                actionClickBehavior: behavior,
              }
            : prev,
        )

        await sendRuntimeMessage({
          action: RuntimeActionIds.PreferencesUpdateActionClickBehavior,
          behavior,
        })
      }
      return success
    },
    [],
  )

  /**
   * Enable/disable automatically showing the inline update log after updates.
   * @param enabled - When true, shows the update log on first UI open after update.
   */
  const updateOpenChangelogOnUpdate = useCallback(async (enabled: boolean) => {
    const success = await userPreferences.updateOpenChangelogOnUpdate(enabled)
    if (success) {
      setPreferences((prev) =>
        prev ? { ...prev, openChangelogOnUpdate: enabled } : prev,
      )
    }
    return success
  }, [])

  /**
   * Enable/disable automatically provisioning a default API key (token) after
   * successfully adding an account.
   * @param enabled - When true, runs token provisioning after account add.
   */
  const updateAutoProvisionKeyOnAccountAdd = useCallback(
    async (enabled: boolean) => {
      const success =
        await userPreferences.updateAutoProvisionKeyOnAccountAdd(enabled)
      if (success) {
        const updates: Partial<UserPreferences> = {
          autoProvisionKeyOnAccountAdd: enabled,
        }
        if (preferences) {
          const next = { ...preferences, ...updates }
          setPreferences(next)
          trackOptionsSettingsSnapshots(next, updates)
        }
      }
      return success
    },
    [preferences],
  )

  /**
   * Enable/disable automatically prefilling the add-account URL from the
   * current browser tab.
   * @param enabled - When true, add-account starts with the current site's origin.
   */
  const updateAutoFillCurrentSiteUrlOnAccountAdd = useCallback(
    async (enabled: boolean) => {
      const success =
        await userPreferences.updateAutoFillCurrentSiteUrlOnAccountAdd(enabled)
      if (success) {
        const updates: Partial<UserPreferences> = {
          autoFillCurrentSiteUrlOnAccountAdd: enabled,
        }
        if (preferences) {
          const next = { ...preferences, ...updates }
          setPreferences(next)
          trackOptionsSettingsSnapshots(next, updates)
        }
      }
      return success
    },
    [preferences],
  )

  /**
   * Enable/disable the duplicate-account add confirmation modal.
   * @param enabled - When true, prompts before adding an account whose site URL already exists.
   */
  const updateWarnOnDuplicateAccountAdd = useCallback(
    async (enabled: boolean) => {
      const success =
        await userPreferences.updateWarnOnDuplicateAccountAdd(enabled)
      if (success) {
        const updates: Partial<UserPreferences> = {
          warnOnDuplicateAccountAdd: enabled,
        }
        if (preferences) {
          const next = { ...preferences, ...updates }
          setPreferences(next)
          trackOptionsSettingsSnapshots(next, updates)
        }
      }
      return success
    },
    [preferences],
  )

  const resetClaudeCodeRouterConfig = useCallback(async () => {
    const success = await userPreferences.resetClaudeCodeRouterConfig()
    if (success) {
      await loadPreferences()
    }
    return success
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
      const success = await userPreferences.savePreferences({
        tempWindowFallbackReminder: updates,
      })
      if (success) {
        setPreferences((prev) => {
          if (!prev) return null
          const merged: TempWindowFallbackReminderPreferences = {
            ...(DEFAULT_PREFERENCES.tempWindowFallbackReminder ?? {
              dismissed: false,
            }),
            ...(prev.tempWindowFallbackReminder ?? {}),
            ...updates,
          }
          return {
            ...prev,
            tempWindowFallbackReminder: merged,
            lastUpdated: Date.now(),
          }
        })
      }
      return success
    },
    [],
  )

  const updateDefaultTab = useCallback(async (activeTab: DashboardTabType) => {
    const success = await userPreferences.updateActiveTab(activeTab)
    if (success) {
      setPreferences((prev) => (prev ? { ...prev, activeTab } : null))
    }
    return success
  }, [])

  const updateCurrencyType = useCallback(async (currencyType: CurrencyType) => {
    const success = await userPreferences.updateCurrencyType(currencyType)
    if (success) {
      setPreferences((prev) => (prev ? { ...prev, currencyType } : null))
    }
    return success
  }, [])

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

      const success = await userPreferences.savePreferences(updates)
      if (success && preferences) {
        const next = deepOverride(preferences, updates)
        setPreferences(next)
        trackOptionsSettingsSnapshots(next, updates)
      }
      return success
    },
    [preferences],
  )

  const updateSortConfig = useCallback(
    async (sortField: SortField, sortOrder: SortOrder) => {
      const success = await userPreferences.updateSortConfig(
        sortField,
        sortOrder,
      )
      if (success) {
        setPreferences((prev) =>
          prev ? { ...prev, sortField, sortOrder } : null,
        )
      }
      return success
    },
    [],
  )

  const updateSortingPriorityConfig = useCallback(
    async (sortingPriority: SortingPriorityConfig) => {
      const success =
        await userPreferences.setSortingPriorityConfig(sortingPriority)
      if (success) {
        setPreferences((prev) =>
          prev
            ? {
                ...prev,
                sortingPriorityConfig: sortingPriority,
              }
            : null,
        )
      }
      return success
    },
    [],
  )

  const updateAutoRefresh = useCallback(async (enabled: boolean) => {
    const updates = {
      accountAutoRefresh: { enabled: enabled },
    }
    const savedPreferences =
      await userPreferences.savePreferencesWithResult(updates)
    if (savedPreferences) {
      const nextPreferences =
        normalizeContextPreferenceSnapshot(savedPreferences)
      setPreferences(nextPreferences)
      trackOptionsSettingsSnapshots(nextPreferences, updates)
      sendRuntimeMessage({
        action: RuntimeActionIds.AutoRefreshUpdateSettings,
        settings: updates,
      })
    }
    return savedPreferences !== null
  }, [])

  const updateRefreshInterval = useCallback(async (interval: number) => {
    const updates = {
      accountAutoRefresh: { interval: interval },
    }
    const savedPreferences =
      await userPreferences.savePreferencesWithResult(updates)
    if (savedPreferences) {
      const nextPreferences =
        normalizeContextPreferenceSnapshot(savedPreferences)
      setPreferences(nextPreferences)
      trackOptionsSettingsSnapshots(nextPreferences, updates)
      sendRuntimeMessage({
        action: RuntimeActionIds.AutoRefreshUpdateSettings,
        settings: updates,
      })
    }
    return savedPreferences !== null
  }, [])

  const updateMinRefreshInterval = useCallback(async (minInterval: number) => {
    const updates = {
      accountAutoRefresh: { minInterval: minInterval },
    }
    const savedPreferences =
      await userPreferences.savePreferencesWithResult(updates)
    if (savedPreferences) {
      const nextPreferences =
        normalizeContextPreferenceSnapshot(savedPreferences)
      setPreferences(nextPreferences)
      trackOptionsSettingsSnapshots(nextPreferences, updates)
      sendRuntimeMessage({
        action: RuntimeActionIds.AutoRefreshUpdateSettings,
        settings: updates,
      })
    }
    return savedPreferences !== null
  }, [])

  const updateRefreshOnOpen = useCallback(async (refreshOnOpen: boolean) => {
    const updates = {
      accountAutoRefresh: { refreshOnOpen: refreshOnOpen },
    }
    const savedPreferences =
      await userPreferences.savePreferencesWithResult(updates)
    if (savedPreferences) {
      const nextPreferences =
        normalizeContextPreferenceSnapshot(savedPreferences)
      setPreferences(nextPreferences)
      trackOptionsSettingsSnapshots(nextPreferences, updates)
      sendRuntimeMessage({
        action: RuntimeActionIds.AutoRefreshUpdateSettings,
        settings: updates,
      })
    }
    return savedPreferences !== null
  }, [])

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
      const success = await userPreferences.updateManagedSiteType(siteType)
      if (success) {
        setPreferences((prev) =>
          prev ? { ...prev, managedSiteType: siteType } : null,
        )
      }
      return success
    },
    [],
  )

  const updateThemeMode = useCallback(async (themeMode: ThemeMode) => {
    const success = await userPreferences.savePreferences({ themeMode })
    if (success) {
      setPreferences((prev) => (prev ? { ...prev, themeMode } : null))
    }
    return success
  }, [])

  const updateLoggingConsoleEnabled = useCallback(async (enabled: boolean) => {
    const updates = { logging: { consoleEnabled: enabled } }
    const success = await userPreferences.updateLoggingPreferences({
      consoleEnabled: enabled,
    })
    if (success) {
      setPreferences((prev) => (prev ? deepOverride(prev, updates) : null))
    }
    return success
  }, [])

  const updateLoggingLevel = useCallback(async (level: LogLevel) => {
    const updates = { logging: { level } }
    const success = await userPreferences.updateLoggingPreferences({ level })
    if (success) {
      setPreferences((prev) => (prev ? deepOverride(prev, updates) : null))
    }
    return success
  }, [])

  const updateAutoCheckin = useCallback(
    async (updates: Partial<AutoCheckinPreferences>) => {
      const preferenceUpdates = {
        autoCheckin: updates,
      }
      const savedPreferences =
        await userPreferences.savePreferencesWithResult(preferenceUpdates)

      if (savedPreferences) {
        const nextPreferences = normalizeContextPreferenceSnapshot({
          ...savedPreferences,
          autoCheckin: deepOverride(
            DEFAULT_PREFERENCES.autoCheckin,
            savedPreferences.autoCheckin ?? updates,
          ),
        })
        setPreferences(nextPreferences)
        trackOptionsSettingsSnapshots(nextPreferences, preferenceUpdates)

        // Notify background to update alarm
        await sendRuntimeMessage({
          action: RuntimeActionIds.AutoCheckinUpdateSettings,
          settings: updates,
        })
      }
      return savedPreferences !== null
    },
    [],
  )

  const updateBalanceHistory = useCallback(
    async (updates: Partial<BalanceHistoryPreferences>) => {
      const preferenceUpdates = {
        balanceHistory: updates,
      }
      const savedPreferences =
        await userPreferences.savePreferencesWithResult(preferenceUpdates)

      if (savedPreferences) {
        const nextPreferences = normalizeContextPreferenceSnapshot({
          ...savedPreferences,
          balanceHistory: deepOverride(
            DEFAULT_PREFERENCES.balanceHistory ??
              DEFAULT_BALANCE_HISTORY_PREFERENCES,
            savedPreferences.balanceHistory ?? updates,
          ),
        })
        setPreferences(nextPreferences)
        trackOptionsSettingsSnapshots(nextPreferences, preferenceUpdates)

        await sendRuntimeMessage({
          action: RuntimeActionIds.BalanceHistoryUpdateSettings,
          settings: updates,
        })
      }

      return savedPreferences !== null
    },
    [],
  )

  const updateNewApiModelSync = useCallback(
    async (updates: Partial<UserManagedSiteModelSyncConfig>) => {
      const preferenceUpdates = {
        managedSiteModelSync: updates,
      }
      const savedPreferences =
        await userPreferences.savePreferencesWithResult(preferenceUpdates)

      if (savedPreferences) {
        const nextPreferences = normalizeContextPreferenceSnapshot({
          ...savedPreferences,
          managedSiteModelSync: deepOverride(
            DEFAULT_MANAGED_SITE_MODEL_SYNC_CONFIG,
            savedPreferences.managedSiteModelSync ?? updates,
          ) as UserManagedSiteModelSyncConfig,
        })
        setPreferences(nextPreferences)
        trackOptionsSettingsSnapshots(nextPreferences, preferenceUpdates)

        // Notify background to update alarm
        await sendRuntimeMessage({
          action: RuntimeActionIds.ModelSyncUpdateSettings,
          settings: updates,
        })
      }
      return savedPreferences !== null
    },
    [],
  )

  const updateModelRedirect = useCallback(
    async (updates: Partial<ModelRedirectPreferences>) => {
      const preferenceUpdates = {
        modelRedirect: updates,
      }
      const savedPreferences =
        await userPreferences.savePreferencesWithResult(preferenceUpdates)
      if (savedPreferences) {
        const nextPreferences = normalizeContextPreferenceSnapshot({
          ...savedPreferences,
          modelRedirect: deepOverride(
            DEFAULT_PREFERENCES.modelRedirect,
            savedPreferences.modelRedirect ?? updates,
          ),
        })
        setPreferences(nextPreferences)
        trackOptionsSettingsSnapshots(nextPreferences, preferenceUpdates)
      }
      return savedPreferences !== null
    },
    [],
  )

  const updateRedemptionAssist = useCallback(
    async (updates: Partial<RedemptionAssistPreferences>) => {
      const preferenceUpdates = {
        redemptionAssist: updates,
      }
      const savedPreferences =
        await userPreferences.savePreferencesWithResult(preferenceUpdates)

      if (savedPreferences) {
        const nextPreferences = normalizeContextPreferenceSnapshot({
          ...savedPreferences,
          redemptionAssist: deepOverride(
            DEFAULT_PREFERENCES.redemptionAssist ??
              DEFAULT_REDEMPTION_ASSIST_PREFERENCES,
            savedPreferences.redemptionAssist ?? updates,
          ),
        })
        setPreferences(nextPreferences)
        trackOptionsSettingsSnapshots(nextPreferences, preferenceUpdates)

        await sendRuntimeMessage({
          action: RuntimeActionIds.RedemptionAssistUpdateSettings,
          settings: updates,
        })

        const shouldRefreshContextMenus =
          typeof updates.contextMenu?.enabled === "boolean" ||
          typeof updates.enabled === "boolean"

        if (shouldRefreshContextMenus) {
          void sendRuntimeMessage({
            action: RuntimeActionIds.PreferencesRefreshContextMenus,
          })
        }
      }

      return savedPreferences !== null
    },
    [],
  )

  const updateWebAiApiCheck = useCallback(
    async (updates: Partial<WebAiApiCheckPreferences>) => {
      const preferenceUpdates = {
        webAiApiCheck: updates,
      }
      const savedPreferences =
        await userPreferences.savePreferencesWithResult(preferenceUpdates)

      if (savedPreferences) {
        const nextPreferences = normalizeContextPreferenceSnapshot({
          ...savedPreferences,
          webAiApiCheck: deepOverride(
            DEFAULT_PREFERENCES.webAiApiCheck ??
              DEFAULT_WEB_AI_API_CHECK_PREFERENCES,
            savedPreferences.webAiApiCheck ?? updates,
          ),
        })
        setPreferences(nextPreferences)
        trackOptionsSettingsSnapshots(nextPreferences, preferenceUpdates)

        const shouldRefreshContextMenus =
          typeof updates.contextMenu?.enabled === "boolean" ||
          typeof updates.enabled === "boolean"

        if (shouldRefreshContextMenus) {
          void sendRuntimeMessage({
            action: RuntimeActionIds.PreferencesRefreshContextMenus,
          })
        }
      }

      return savedPreferences !== null
    },
    [],
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
        await sendRuntimeMessage(
          typeof options?.expectedLastUpdated === "number"
            ? {
                action: RuntimeActionIds.WebdavAutoSyncUpdateSettings,
                settings: updates,
                expectedLastUpdated: options.expectedLastUpdated,
              }
            : {
                action: RuntimeActionIds.WebdavAutoSyncUpdateSettings,
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
      const savedPreferences =
        await userPreferences.savePreferencesWithResult(preferenceUpdates)
      if (savedPreferences) {
        const nextPreferences = normalizeContextPreferenceSnapshot({
          ...savedPreferences,
          tempWindowFallback: deepOverride(
            DEFAULT_TEMP_WINDOW_FALLBACK_CONFIG,
            savedPreferences.tempWindowFallback ?? updates,
          ) as TempWindowFallbackPreferences,
        })
        setPreferences(nextPreferences)
        trackOptionsSettingsSnapshots(nextPreferences, preferenceUpdates)
      }
      return savedPreferences !== null
    },
    [],
  )

  const updateTaskNotifications = useCallback(
    async (updates: Partial<TaskNotificationPreferences>) => {
      const preferenceUpdates = {
        taskNotifications: updates,
      }
      const savedPreferences =
        await userPreferences.savePreferencesWithResult(preferenceUpdates)
      if (savedPreferences) {
        const nextPreferences = normalizeContextPreferenceSnapshot({
          ...savedPreferences,
          taskNotifications: normalizeTaskNotificationPreferences(
            deepOverride(
              DEFAULT_TASK_NOTIFICATION_PREFERENCES,
              savedPreferences.taskNotifications ?? updates,
            ),
          ),
        })
        setPreferences(nextPreferences)
        trackOptionsSettingsSnapshots(nextPreferences, preferenceUpdates)
      }
      return savedPreferences !== null
    },
    [],
  )

  const updateSiteAnnouncementNotifications = useCallback(
    async (updates: Partial<SiteAnnouncementPreferences>) => {
      const response = normalizeRuntimeMutationResponse(
        await sendRuntimeMessage({
          action: RuntimeActionIds.SiteAnnouncementsUpdatePreferences,
          settings: updates,
        }),
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

      return response.success
    },
    [preferences],
  )
  const resetToDefaults = useCallback(async () => {
    const success = await userPreferences.resetToDefaults()
    if (success) {
      await loadPreferences()

      // Notify all background services about the reset
      const defaults = DEFAULT_PREFERENCES
      trackOptionsSettingsSnapshots(defaults)

      // Notify auto-refresh service
      sendRuntimeMessage({
        action: RuntimeActionIds.AutoRefreshUpdateSettings,
        settings: { accountAutoRefresh: defaults.accountAutoRefresh },
      })

      // Notify auto-checkin service
      if (defaults.autoCheckin) {
        void sendRuntimeMessage({
          action: RuntimeActionIds.AutoCheckinUpdateSettings,
          settings: defaults.autoCheckin,
        })
      }

      // Notify New API model sync service
      if (defaults.managedSiteModelSync) {
        void sendRuntimeMessage({
          action: RuntimeActionIds.ModelSyncUpdateSettings,
          settings: defaults.managedSiteModelSync,
        })
      }
    }
    return success
  }, [loadPreferences])

  const resetDisplaySettings = useCallback(async () => {
    const success = await userPreferences.resetDisplaySettings()
    if (success) {
      const now = Date.now()
      setPreferences((prev) =>
        prev
          ? {
              ...prev,
              activeTab: DEFAULT_PREFERENCES.activeTab,
              currencyType: DEFAULT_PREFERENCES.currencyType,
              lastUpdated: now,
            }
          : prev,
      )
      trackOptionsSettingsSnapshots(
        { ...DEFAULT_PREFERENCES, lastUpdated: now },
        {
          activeTab: DEFAULT_PREFERENCES.activeTab,
          currencyType: DEFAULT_PREFERENCES.currencyType,
          showTodayCashflow: DEFAULT_PREFERENCES.showTodayCashflow,
        },
      )
    }
    return success
  }, [])

  const resetAutoRefreshConfig = useCallback(async () => {
    const success = await userPreferences.resetAutoRefreshConfig()
    if (success) {
      const defaults = DEFAULT_PREFERENCES.accountAutoRefresh

      setPreferences((prev) =>
        prev
          ? deepOverride(prev, {
              accountAutoRefresh: defaults,
              lastUpdated: Date.now(),
            })
          : prev,
      )
      sendRuntimeMessage({
        action: RuntimeActionIds.AutoRefreshUpdateSettings,
        settings: { accountAutoRefresh: defaults },
      })
      trackOptionsSettingsSnapshots(
        deepOverride(DEFAULT_PREFERENCES, { accountAutoRefresh: defaults }),
        { accountAutoRefresh: defaults },
      )
    }
    return success
  }, [])

  const resetNewApiConfig = useCallback(async () => {
    const success = await userPreferences.resetNewApiConfig()
    if (success) {
      await reloadPreferencesAndTrackSnapshots({
        newApi: DEFAULT_PREFERENCES.newApi,
      })
    }
    return success
  }, [reloadPreferencesAndTrackSnapshots])

  const resetDoneHubConfig = useCallback(async () => {
    const success = await userPreferences.resetDoneHubConfig()
    if (success) {
      await reloadPreferencesAndTrackSnapshots({
        doneHub: DEFAULT_PREFERENCES.doneHub,
      })
    }
    return success
  }, [reloadPreferencesAndTrackSnapshots])

  const resetVeloeraConfig = useCallback(async () => {
    const success = await userPreferences.resetVeloeraConfig()
    if (success) {
      await reloadPreferencesAndTrackSnapshots({
        veloera: DEFAULT_PREFERENCES.veloera,
      })
    }
    return success
  }, [reloadPreferencesAndTrackSnapshots])

  const resetOctopusConfig = useCallback(async () => {
    const success = await userPreferences.resetOctopusConfig()
    if (success) {
      await reloadPreferencesAndTrackSnapshots({
        octopus: DEFAULT_PREFERENCES.octopus,
      })
    }
    return success
  }, [reloadPreferencesAndTrackSnapshots])

  const resetAxonHubConfig = useCallback(async () => {
    const success = await userPreferences.resetAxonHubConfig()
    if (success) {
      await reloadPreferencesAndTrackSnapshots({
        axonHub: DEFAULT_PREFERENCES.axonHub,
      })
    }
    return success
  }, [reloadPreferencesAndTrackSnapshots])

  const resetClaudeCodeHubConfig = useCallback(async () => {
    const success = await userPreferences.resetClaudeCodeHubConfig()
    if (success) {
      await reloadPreferencesAndTrackSnapshots({
        claudeCodeHub: DEFAULT_PREFERENCES.claudeCodeHub,
      })
    }
    return success
  }, [reloadPreferencesAndTrackSnapshots])

  const resetNewApiModelSyncConfig = useCallback(async () => {
    const success = await userPreferences.resetNewApiModelSyncConfig()
    if (success) {
      const defaults = DEFAULT_PREFERENCES.managedSiteModelSync
      setPreferences((prev) =>
        prev
          ? deepOverride(prev, {
              managedSiteModelSync: defaults,
              lastUpdated: Date.now(),
            })
          : prev,
      )
      if (defaults) {
        void sendRuntimeMessage({
          action: RuntimeActionIds.ModelSyncUpdateSettings,
          settings: defaults,
        })
      }
      trackOptionsSettingsSnapshots(
        deepOverride(DEFAULT_PREFERENCES, { managedSiteModelSync: defaults }),
        { managedSiteModelSync: defaults },
      )
    }
    return success
  }, [])

  const resetCliProxyConfig = useCallback(async () => {
    const success = await userPreferences.resetCliProxyConfig()
    if (success) {
      await reloadPreferencesAndTrackSnapshots({
        cliProxy: DEFAULT_PREFERENCES.cliProxy,
      })
    }
    return success
  }, [reloadPreferencesAndTrackSnapshots])

  const resetAutoCheckinConfig = useCallback(async () => {
    const success = await userPreferences.resetAutoCheckinConfig()
    if (success) {
      const defaults = DEFAULT_PREFERENCES.autoCheckin
      setPreferences((prev) =>
        prev
          ? deepOverride(prev, {
              autoCheckin: defaults,
              lastUpdated: Date.now(),
            })
          : prev,
      )
      if (defaults) {
        void sendRuntimeMessage({
          action: RuntimeActionIds.AutoCheckinUpdateSettings,
          settings: defaults,
        })
      }
      trackOptionsSettingsSnapshots(
        deepOverride(DEFAULT_PREFERENCES, { autoCheckin: defaults }),
        { autoCheckin: defaults },
      )
    }
    return success
  }, [])

  const resetRedemptionAssistConfig = useCallback(async () => {
    const success = await userPreferences.resetRedemptionAssist()
    if (success) {
      const defaults = DEFAULT_PREFERENCES.redemptionAssist
      setPreferences((prev) =>
        prev
          ? deepOverride(prev, {
              redemptionAssist: defaults,
              lastUpdated: Date.now(),
            })
          : prev,
      )
      if (defaults) {
        void sendRuntimeMessage({
          action: RuntimeActionIds.RedemptionAssistUpdateSettings,
          settings: defaults,
        })
      }
      trackOptionsSettingsSnapshots(
        deepOverride(DEFAULT_PREFERENCES, { redemptionAssist: defaults }),
        { redemptionAssist: defaults },
      )
    }
    return success
  }, [])

  const resetWebAiApiCheckConfig = useCallback(async () => {
    const success = await userPreferences.resetWebAiApiCheck()
    if (success) {
      const defaults = DEFAULT_PREFERENCES.webAiApiCheck
      setPreferences((prev) =>
        prev
          ? deepOverride(prev, {
              webAiApiCheck: defaults,
              lastUpdated: Date.now(),
            })
          : prev,
      )
      trackOptionsSettingsSnapshots(
        deepOverride(DEFAULT_PREFERENCES, { webAiApiCheck: defaults }),
        { webAiApiCheck: defaults },
      )
    }
    return success
  }, [])

  const resetModelRedirectConfig = useCallback(async () => {
    const success = await userPreferences.resetModelRedirectConfig()
    if (success) {
      const defaults = DEFAULT_PREFERENCES.modelRedirect
      setPreferences((prev) =>
        prev
          ? deepOverride(prev, {
              modelRedirect: defaults,
              lastUpdated: Date.now(),
            })
          : prev,
      )
      trackOptionsSettingsSnapshots(
        deepOverride(DEFAULT_PREFERENCES, { modelRedirect: defaults }),
        { modelRedirect: defaults },
      )
    }
    return success
  }, [])

  const resetWebdavConfig = useCallback(async () => {
    const success = await userPreferences.resetWebdavConfig()
    if (success) {
      await reloadPreferencesAndTrackSnapshots({
        webdav: DEFAULT_PREFERENCES.webdav,
      })
    }
    return success
  }, [reloadPreferencesAndTrackSnapshots])

  const resetLoggingSettings = useCallback(async () => {
    const defaults = DEFAULT_PREFERENCES.logging
    const success = await userPreferences.updateLoggingPreferences(defaults)
    if (success) {
      setPreferences((prev) =>
        prev
          ? deepOverride(prev, { logging: defaults, lastUpdated: Date.now() })
          : prev,
      )
    }
    return success
  }, [])

  const resetSortingPriorityConfig = useCallback(async () => {
    const success = await userPreferences.resetSortingPriorityConfig()
    if (success) {
      setPreferences((prev) =>
        prev
          ? {
              ...prev,
              sortingPriorityConfig: undefined,
              lastUpdated: Date.now(),
            }
          : prev,
      )
    }
    return success
  }, [])

  const resetTaskNotifications = useCallback(async () => {
    const success = await userPreferences.resetTaskNotifications()
    if (success) {
      setPreferences((prev) =>
        prev
          ? deepOverride(prev, {
              taskNotifications: DEFAULT_PREFERENCES.taskNotifications,
              lastUpdated: Date.now(),
            })
          : prev,
      )
      trackOptionsSettingsSnapshots(
        deepOverride(DEFAULT_PREFERENCES, {
          taskNotifications: DEFAULT_PREFERENCES.taskNotifications,
        }),
        { taskNotifications: DEFAULT_PREFERENCES.taskNotifications },
      )
    }
    return success
  }, [])

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
      const success = await userPreferences.savePreferences(updates)
      if (success) {
        setPreferences((prev) => (prev ? deepOverride(prev, updates) : null))
      }
    })()
  }, [preferences])

  if (!preferences) {
    return null
  }

  const value = {
    preferences,
    isLoading,
    activeTab: preferences?.activeTab || DATA_TYPE_CASHFLOW,
    currencyType: preferences?.currencyType || "USD",
    showTodayCashflow: preferences?.showTodayCashflow ?? true,
    sortField: preferences?.sortField || UI_CONSTANTS.SORT.DEFAULT_FIELD,
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
    actionClickBehavior: preferences?.actionClickBehavior ?? "popup",
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
