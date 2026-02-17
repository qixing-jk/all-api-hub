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
import { NEW_API, type ManagedSiteType } from "~/constants/siteType"
import { UI_CONSTANTS } from "~/constants/ui"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
  type RedemptionAssistPreferences,
  type TempWindowFallbackPreferences,
  type TempWindowFallbackReminderPreferences,
  type UserPreferences,
  type WebAiApiCheckPreferences,
} from "~/services/userPreferences"
import type {
  CurrencyType,
  DashboardTabType,
  SortField,
  SortOrder,
} from "~/types"
import { DEFAULT_ACCOUNT_AUTO_REFRESH } from "~/types/accountAutoRefresh"
import type { AutoCheckinPreferences } from "~/types/autoCheckin"
import {
  DEFAULT_BALANCE_HISTORY_PREFERENCES,
  type BalanceHistoryPreferences,
} from "~/types/dailyBalanceHistory"
import { DEFAULT_DONE_HUB_CONFIG } from "~/types/doneHubConfig"
import type { LogLevel } from "~/types/logging"
import type { ModelRedirectPreferences } from "~/types/managedSiteModelRedirect"
import type { SortingPriorityConfig } from "~/types/sorting"
import type { ThemeMode } from "~/types/theme"
import { deepOverride } from "~/utils"
import { sendRuntimeMessage } from "~/utils/browserApi"
import { createLogger } from "~/utils/logger"
import { DEFAULT_SORTING_PRIORITY_CONFIG } from "~/utils/sortingPriority"

const logger = createLogger("UserPreferencesContext")

type UserManagedSiteModelSyncConfig = NonNullable<
  UserPreferences["managedSiteModelSync"]
>

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
  newApiBaseUrl: string
  newApiAdminToken: string
  newApiUserId: string
  doneHubBaseUrl: string
  doneHubAdminToken: string
  doneHubUserId: string
  veloeraBaseUrl: string
  veloeraAdminToken: string
  veloeraUserId: string
  octopusBaseUrl: string
  octopusUsername: string
  octopusPassword: string
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
  updateNewApiBaseUrl: (url: string) => Promise<boolean>
  updateNewApiAdminToken: (token: string) => Promise<boolean>
  updateNewApiUserId: (userId: string) => Promise<boolean>
  updateDoneHubBaseUrl: (url: string) => Promise<boolean>
  updateDoneHubAdminToken: (token: string) => Promise<boolean>
  updateDoneHubUserId: (userId: string) => Promise<boolean>
  updateVeloeraBaseUrl: (url: string) => Promise<boolean>
  updateVeloeraAdminToken: (token: string) => Promise<boolean>
  updateVeloeraUserId: (userId: string) => Promise<boolean>
  updateOctopusBaseUrl: (url: string) => Promise<boolean>
  updateOctopusUsername: (username: string) => Promise<boolean>
  updateOctopusPassword: (password: string) => Promise<boolean>
  updateManagedSiteType: (siteType: ManagedSiteType) => Promise<boolean>
  updateCliProxyBaseUrl: (url: string) => Promise<boolean>
  updateCliProxyManagementKey: (key: string) => Promise<boolean>
  updateClaudeCodeRouterBaseUrl: (url: string) => Promise<boolean>
  updateClaudeCodeRouterApiKey: (key: string) => Promise<boolean>
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
  updateTempWindowFallback: (
    updates: Partial<TempWindowFallbackPreferences>,
  ) => Promise<boolean>
  updateTempWindowFallbackReminder: (
    updates: Partial<TempWindowFallbackReminderPreferences>,
  ) => Promise<boolean>
  resetToDefaults: () => Promise<boolean>
  resetDisplaySettings: () => Promise<boolean>
  resetAutoRefreshConfig: () => Promise<boolean>
  resetNewApiConfig: () => Promise<boolean>
  resetDoneHubConfig: () => Promise<boolean>
  resetVeloeraConfig: () => Promise<boolean>
  resetOctopusConfig: () => Promise<boolean>
  resetNewApiModelSyncConfig: () => Promise<boolean>
  resetCliProxyConfig: () => Promise<boolean>
  resetClaudeCodeRouterConfig: () => Promise<boolean>
  resetAutoCheckinConfig: () => Promise<boolean>
  resetRedemptionAssistConfig: () => Promise<boolean>
  resetWebAiApiCheckConfig: () => Promise<boolean>
  resetModelRedirectConfig: () => Promise<boolean>
  resetWebdavConfig: () => Promise<boolean>
  resetThemeAndLanguage: () => Promise<boolean>
  resetLoggingSettings: () => Promise<boolean>
  resetSortingPriorityConfig: () => Promise<boolean>
  loadPreferences: () => Promise<void>
}

// 2. 创建 Context
const UserPreferencesContext = createContext<
  UserPreferencesContextType | undefined
>(undefined)

/**
 * Top-level provider that loads persisted user preferences, exposes update
 * helpers, and keeps background scripts informed about configuration changes.
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

  useEffect(() => {
    loadPreferences()
  }, [loadPreferences])

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
   * Enable/disable automatically opening the docs changelog page after updates.
   * @param enabled - When true, opens the changelog in a new tab on update.
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
        setPreferences((prev) =>
          prev ? { ...prev, autoProvisionKeyOnAccountAdd: enabled } : prev,
        )
      }
      return success
    },
    [],
  )

  const resetClaudeCodeRouterConfig = useCallback(async () => {
    const success = await userPreferences.resetClaudeCodeRouterConfig()
    if (success) {
      const defaults = DEFAULT_PREFERENCES.claudeCodeRouter
      setPreferences((prev) =>
        prev
          ? deepOverride(prev, {
              claudeCodeRouter: defaults,
              lastUpdated: Date.now(),
            })
          : prev,
      )
    }
    return success
  }, [])

  /**
   * Update the CLI proxy base URL and merge it into the preference tree so
   * dependent features read the latest endpoint.
   */
  const updateCliProxyBaseUrl = useCallback(async (baseUrl: string) => {
    const updates = {
      cliProxy: { baseUrl },
    }
    const success = await userPreferences.savePreferences(updates)
    if (success) {
      setPreferences((prev) => (prev ? deepOverride(prev, updates) : null))
    }
    return success
  }, [])

  /**
   * Persist the CLI proxy management key token used for authenticated calls.
   * @param managementKey - User-provided secret for the CLI proxy service.
   */
  const updateCliProxyManagementKey = useCallback(
    async (managementKey: string) => {
      const updates = {
        cliProxy: { managementKey },
      }
      const success = await userPreferences.savePreferences(updates)
      if (success) {
        setPreferences((prev) => (prev ? deepOverride(prev, updates) : null))
      }
      return success
    },
    [],
  )

  const updateClaudeCodeRouterBaseUrl = useCallback(async (baseUrl: string) => {
    const updates = {
      claudeCodeRouter: { baseUrl },
    }
    const success = await userPreferences.savePreferences(updates)
    if (success) {
      setPreferences((prev) => (prev ? deepOverride(prev, updates) : null))
    }
    return success
  }, [])

  const updateClaudeCodeRouterApiKey = useCallback(async (apiKey: string) => {
    const updates = {
      claudeCodeRouter: { apiKey },
    }
    const success = await userPreferences.savePreferences(updates)
    if (success) {
      setPreferences((prev) => (prev ? deepOverride(prev, updates) : null))
    }
    return success
  }, [])

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
      if (success) {
        setPreferences((prev) => (prev ? deepOverride(prev, updates) : null))
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
    const success = await userPreferences.savePreferences(updates)
    if (success) {
      setPreferences((prev) => (prev ? deepOverride(prev, updates) : null))
      sendRuntimeMessage({
        action: RuntimeActionIds.AutoRefreshUpdateSettings,
        settings: updates,
      })
    }
    return success
  }, [])

  const updateRefreshInterval = useCallback(async (interval: number) => {
    const updates = {
      accountAutoRefresh: { interval: interval },
    }
    const success = await userPreferences.savePreferences(updates)
    if (success) {
      setPreferences((prev) => (prev ? deepOverride(prev, updates) : null))
      sendRuntimeMessage({
        action: RuntimeActionIds.AutoRefreshUpdateSettings,
        settings: updates,
      })
    }
    return success
  }, [])

  const updateMinRefreshInterval = useCallback(async (minInterval: number) => {
    const updates = {
      accountAutoRefresh: { minInterval: minInterval },
    }
    const success = await userPreferences.savePreferences(updates)
    if (success) {
      setPreferences((prev) => (prev ? deepOverride(prev, updates) : null))
      sendRuntimeMessage({
        action: RuntimeActionIds.AutoRefreshUpdateSettings,
        settings: updates,
      })
    }
    return success
  }, [])

  const updateRefreshOnOpen = useCallback(async (refreshOnOpen: boolean) => {
    const updates = {
      accountAutoRefresh: { refreshOnOpen: refreshOnOpen },
    }
    const success = await userPreferences.savePreferences(updates)
    if (success) {
      setPreferences((prev) => (prev ? deepOverride(prev, updates) : null))
      sendRuntimeMessage({
        action: RuntimeActionIds.AutoRefreshUpdateSettings,
        settings: updates,
      })
    }
    return success
  }, [])

  const updateNewApiBaseUrl = useCallback(async (baseUrl: string) => {
    const updates = {
      newApi: { baseUrl },
    }
    const success = await userPreferences.savePreferences(updates)
    if (success) {
      setPreferences((prev) => (prev ? deepOverride(prev, updates) : null))
    }
    return success
  }, [])

  const updateNewApiAdminToken = useCallback(async (adminToken: string) => {
    const updates = {
      newApi: { adminToken },
    }
    const success = await userPreferences.savePreferences(updates)
    if (success) {
      setPreferences((prev) => (prev ? deepOverride(prev, updates) : null))
    }
    return success
  }, [])

  const updateNewApiUserId = useCallback(async (userId: string) => {
    const updates = {
      newApi: { userId },
    }
    const success = await userPreferences.savePreferences(updates)
    if (success) {
      setPreferences((prev) => (prev ? deepOverride(prev, updates) : null))
    }
    return success
  }, [])

  const updateDoneHubBaseUrl = useCallback(async (baseUrl: string) => {
    const updates = {
      doneHub: { baseUrl },
    }
    const success = await userPreferences.savePreferences(updates)
    if (success) {
      setPreferences((prev) => (prev ? deepOverride(prev, updates) : null))
    }
    return success
  }, [])

  const updateDoneHubAdminToken = useCallback(async (adminToken: string) => {
    const updates = {
      doneHub: { adminToken },
    }
    const success = await userPreferences.savePreferences(updates)
    if (success) {
      setPreferences((prev) => (prev ? deepOverride(prev, updates) : null))
    }
    return success
  }, [])

  const updateDoneHubUserId = useCallback(async (userId: string) => {
    const updates = {
      doneHub: { userId },
    }
    const success = await userPreferences.savePreferences(updates)
    if (success) {
      setPreferences((prev) => (prev ? deepOverride(prev, updates) : null))
    }
    return success
  }, [])

  const updateVeloeraBaseUrl = useCallback(async (baseUrl: string) => {
    const updates = {
      veloera: { baseUrl },
    }
    const success = await userPreferences.savePreferences(updates)
    if (success) {
      setPreferences((prev) => (prev ? deepOverride(prev, updates) : null))
    }
    return success
  }, [])

  const updateVeloeraAdminToken = useCallback(async (adminToken: string) => {
    const updates = {
      veloera: { adminToken },
    }
    const success = await userPreferences.savePreferences(updates)
    if (success) {
      setPreferences((prev) => (prev ? deepOverride(prev, updates) : null))
    }
    return success
  }, [])

  const updateVeloeraUserId = useCallback(async (userId: string) => {
    const updates = {
      veloera: { userId },
    }
    const success = await userPreferences.savePreferences(updates)
    if (success) {
      setPreferences((prev) => (prev ? deepOverride(prev, updates) : null))
    }
    return success
  }, [])

  const updateOctopusBaseUrl = useCallback(async (baseUrl: string) => {
    const updates = {
      octopus: { baseUrl },
    }
    const success = await userPreferences.savePreferences(updates)
    if (success) {
      setPreferences((prev) => (prev ? deepOverride(prev, updates) : null))
    }
    return success
  }, [])

  const updateOctopusUsername = useCallback(async (username: string) => {
    const updates = {
      octopus: { username },
    }
    const success = await userPreferences.savePreferences(updates)
    if (success) {
      setPreferences((prev) => (prev ? deepOverride(prev, updates) : null))
    }
    return success
  }, [])

  const updateOctopusPassword = useCallback(async (password: string) => {
    const updates = {
      octopus: { password },
    }
    const success = await userPreferences.savePreferences(updates)
    if (success) {
      setPreferences((prev) => (prev ? deepOverride(prev, updates) : null))
    }
    return success
  }, [])

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
      const success = await userPreferences.savePreferences({
        autoCheckin: updates,
      })

      if (success) {
        setPreferences((prev) => {
          if (!prev) return null
          const merged = deepOverride(
            prev.autoCheckin ?? DEFAULT_PREFERENCES.autoCheckin,
            updates,
          )
          return {
            ...prev,
            autoCheckin: merged,
          }
        })

        // Notify background to update alarm
        await sendRuntimeMessage({
          action: RuntimeActionIds.AutoCheckinUpdateSettings,
          settings: updates,
        })
      }
      return success
    },
    [],
  )

  const updateBalanceHistory = useCallback(
    async (updates: Partial<BalanceHistoryPreferences>) => {
      const success = await userPreferences.savePreferences({
        balanceHistory: updates,
      })

      if (success) {
        setPreferences((prev) => {
          if (!prev) return null
          const base =
            prev.balanceHistory ??
            DEFAULT_PREFERENCES.balanceHistory ??
            DEFAULT_BALANCE_HISTORY_PREFERENCES
          const merged = deepOverride(base, updates)
          return {
            ...prev,
            balanceHistory: merged,
          }
        })

        await sendRuntimeMessage({
          action: RuntimeActionIds.BalanceHistoryUpdateSettings,
          settings: updates,
        })
      }

      return success
    },
    [],
  )

  const updateNewApiModelSync = useCallback(
    async (updates: Partial<UserManagedSiteModelSyncConfig>) => {
      const success = await userPreferences.savePreferences({
        managedSiteModelSync: updates,
      })
      if (success) {
        setPreferences((prev) => {
          if (!prev) return null
          const base = prev.managedSiteModelSync ??
            DEFAULT_PREFERENCES.managedSiteModelSync ?? {
              enabled: false,
              interval: 24 * 60 * 60 * 1000,
              concurrency: 2,
              maxRetries: 2,
              rateLimit: {
                requestsPerMinute: 20,
                burst: 5,
              },
              allowedModels: [],
              globalChannelModelFilters: [],
            }
          const merged = deepOverride(
            base,
            updates,
          ) as UserManagedSiteModelSyncConfig
          return {
            ...prev,
            managedSiteModelSync: merged,
          }
        })

        // Notify background to update alarm
        await sendRuntimeMessage({
          action: RuntimeActionIds.ModelSyncUpdateSettings,
          settings: updates,
        })
      }
      return success
    },
    [],
  )

  const updateModelRedirect = useCallback(
    async (updates: Partial<ModelRedirectPreferences>) => {
      const success = await userPreferences.savePreferences({
        modelRedirect: updates,
      })
      if (success) {
        setPreferences((prev) => {
          if (!prev) return null
          const merged = deepOverride(
            prev.modelRedirect ?? DEFAULT_PREFERENCES.modelRedirect,
            updates,
          )
          return {
            ...prev,
            modelRedirect: merged,
          }
        })
      }
      return success
    },
    [],
  )

  const updateRedemptionAssist = useCallback(
    async (updates: Partial<RedemptionAssistPreferences>) => {
      const success = await userPreferences.savePreferences({
        redemptionAssist: updates,
      })

      if (success) {
        setPreferences((prev) => {
          if (!prev) return null
          const base =
            prev.redemptionAssist ??
            DEFAULT_PREFERENCES.redemptionAssist ??
            ({
              enabled: true,
              contextMenu: {
                enabled: true,
              },
              relaxedCodeValidation: true,
              urlWhitelist: {
                enabled: true,
                patterns: [],
                includeAccountSiteUrls: true,
                includeCheckInAndRedeemUrls: true,
              },
            } satisfies RedemptionAssistPreferences)

          const merged = deepOverride(base, updates)
          return {
            ...prev,
            redemptionAssist: merged,
            lastUpdated: Date.now(),
          }
        })

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

      return success
    },
    [],
  )

  const updateWebAiApiCheck = useCallback(
    async (updates: Partial<WebAiApiCheckPreferences>) => {
      const success = await userPreferences.savePreferences({
        webAiApiCheck: updates,
      })

      if (success) {
        setPreferences((prev) => {
          if (!prev) return null

          const base =
            prev.webAiApiCheck ??
            DEFAULT_PREFERENCES.webAiApiCheck ??
            ({
              enabled: true,
              contextMenu: {
                enabled: true,
              },
              autoDetect: {
                enabled: false,
                urlWhitelist: {
                  patterns: [],
                },
              },
            } satisfies WebAiApiCheckPreferences)

          const merged = deepOverride(base, updates)
          return {
            ...prev,
            webAiApiCheck: merged,
            lastUpdated: Date.now(),
          }
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

      return success
    },
    [],
  )

  const updateTempWindowFallback = useCallback(
    async (updates: Partial<TempWindowFallbackPreferences>) => {
      const success = await userPreferences.savePreferences({
        tempWindowFallback: updates,
      })
      if (success) {
        setPreferences((prev) => {
          if (!prev) return null
          const merged: TempWindowFallbackPreferences = {
            ...(DEFAULT_PREFERENCES.tempWindowFallback ?? {
              enabled: true,
              useInPopup: true,
              useInSidePanel: true,
              useInOptions: true,
              useForAutoRefresh: true,
              useForManualRefresh: true,
              tempContextMode: "composite",
            }),
            ...(prev.tempWindowFallback ?? {}),
            ...updates,
          }
          return {
            ...prev,
            tempWindowFallback: merged,
            lastUpdated: Date.now(),
          }
        })
      }
      return success
    },
    [],
  )

  const resetToDefaults = useCallback(async () => {
    const success = await userPreferences.resetToDefaults()
    if (success) {
      await loadPreferences()

      // Notify all background services about the reset
      const defaults = DEFAULT_PREFERENCES

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
    }
    return success
  }, [])

  const resetNewApiConfig = useCallback(async () => {
    const success = await userPreferences.resetNewApiConfig()
    if (success) {
      const defaults = DEFAULT_PREFERENCES.newApi
      setPreferences((prev) =>
        prev
          ? deepOverride(prev, {
              newApi: defaults,
              lastUpdated: Date.now(),
            })
          : prev,
      )
    }
    return success
  }, [])

  const resetDoneHubConfig = useCallback(async () => {
    const success = await userPreferences.resetDoneHubConfig()
    if (success) {
      const defaults = DEFAULT_DONE_HUB_CONFIG
      setPreferences((prev) =>
        prev
          ? deepOverride(prev, {
              doneHub: defaults,
              lastUpdated: Date.now(),
            })
          : prev,
      )
    }
    return success
  }, [])

  const resetVeloeraConfig = useCallback(async () => {
    const success = await userPreferences.resetVeloeraConfig()
    if (success) {
      const defaults = DEFAULT_PREFERENCES.veloera
      setPreferences((prev) =>
        prev
          ? deepOverride(prev, {
              veloera: defaults,
              lastUpdated: Date.now(),
            })
          : prev,
      )
    }
    return success
  }, [])

  const resetOctopusConfig = useCallback(async () => {
    const success = await userPreferences.resetOctopusConfig()
    if (success) {
      const defaults = DEFAULT_PREFERENCES.octopus
      setPreferences((prev) =>
        prev
          ? deepOverride(prev, {
              octopus: defaults,
              lastUpdated: Date.now(),
            })
          : prev,
      )
    }
    return success
  }, [])

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
    }
    return success
  }, [])

  const resetCliProxyConfig = useCallback(async () => {
    const success = await userPreferences.resetCliProxyConfig()
    if (success) {
      const defaults = DEFAULT_PREFERENCES.cliProxy
      setPreferences((prev) =>
        prev
          ? deepOverride(prev, {
              cliProxy: defaults,
              lastUpdated: Date.now(),
            })
          : prev,
      )
    }
    return success
  }, [])

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
    }
    return success
  }, [])

  const resetWebdavConfig = useCallback(async () => {
    const success = await userPreferences.resetWebdavConfig()
    if (success) {
      const defaults = DEFAULT_PREFERENCES.webdav
      setPreferences((prev) =>
        prev
          ? deepOverride(prev, {
              webdav: defaults,
              lastUpdated: Date.now(),
            })
          : prev,
      )
    }
    return success
  }, [])

  const resetThemeAndLanguage = useCallback(async () => {
    const success = await userPreferences.resetThemeAndLanguage()
    if (success) {
      const now = Date.now()
      setPreferences((prev) =>
        prev
          ? {
              ...prev,
              themeMode: DEFAULT_PREFERENCES.themeMode,
              language: DEFAULT_PREFERENCES.language,
              lastUpdated: now,
            }
          : prev,
      )
    }
    return success
  }, [])

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

  if (isLoading || !preferences) {
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
    newApiBaseUrl: preferences?.newApi?.baseUrl || "",
    newApiAdminToken: preferences?.newApi?.adminToken || "",
    newApiUserId: preferences?.newApi?.userId || "",
    doneHubBaseUrl: preferences?.doneHub?.baseUrl || "",
    doneHubAdminToken: preferences?.doneHub?.adminToken || "",
    doneHubUserId: preferences?.doneHub?.userId || "",
    veloeraBaseUrl: preferences?.veloera?.baseUrl || "",
    veloeraAdminToken: preferences?.veloera?.adminToken || "",
    veloeraUserId: preferences?.veloera?.userId || "",
    octopusBaseUrl: preferences?.octopus?.baseUrl || "",
    octopusUsername: preferences?.octopus?.username || "",
    octopusPassword: preferences?.octopus?.password || "",
    managedSiteType: preferences?.managedSiteType || NEW_API,
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
    updateNewApiBaseUrl,
    updateNewApiAdminToken,
    updateNewApiUserId,
    updateDoneHubBaseUrl,
    updateDoneHubAdminToken,
    updateDoneHubUserId,
    updateVeloeraBaseUrl,
    updateVeloeraAdminToken,
    updateVeloeraUserId,
    updateOctopusBaseUrl,
    updateOctopusUsername,
    updateOctopusPassword,
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
    updateTempWindowFallback,
    updateTempWindowFallbackReminder,
    resetToDefaults,
    resetDisplaySettings,
    resetAutoRefreshConfig,
    resetNewApiConfig,
    resetDoneHubConfig,
    resetVeloeraConfig,
    resetOctopusConfig,
    resetNewApiModelSyncConfig,
    resetCliProxyConfig,
    resetClaudeCodeRouterConfig,
    resetAutoCheckinConfig,
    resetRedemptionAssistConfig,
    resetWebAiApiCheckConfig,
    resetModelRedirectConfig,
    resetWebdavConfig,
    resetThemeAndLanguage,
    resetLoggingSettings,
    resetSortingPriorityConfig,
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
