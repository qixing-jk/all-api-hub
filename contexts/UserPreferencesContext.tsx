import type { ReactNode } from "react"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react"

import { DATA_TYPE_CASHFLOW } from "~/constants"
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
} from "~/services/userPreferences"
import type {
  CurrencyType,
  DashboardTabType,
  SortField,
  SortOrder,
} from "~/types"
import type { AutoCheckinPreferences } from "~/types/autoCheckin"
import type { ModelRedirectPreferences } from "~/types/managedSiteModelRedirect"
import type { SortingPriorityConfig } from "~/types/sorting"
import type { ThemeMode } from "~/types/theme"
import { deepOverride } from "~/utils"
import { sendRuntimeMessage } from "~/utils/browserApi"
import { DEFAULT_SORTING_PRIORITY_CONFIG } from "~/utils/sortingPriority"

type UserManagedSiteModelSyncConfig = NonNullable<
  UserPreferences["managedSiteModelSync"]
>

// 1. 定义 Context 的值类型
interface UserPreferencesContextType {
  preferences: UserPreferences
  isLoading: boolean
  activeTab: DashboardTabType
  currencyType: CurrencyType
  sortingPriorityConfig: SortingPriorityConfig
  sortField: SortField
  sortOrder: SortOrder
  autoRefresh: boolean
  refreshInterval: number
  minRefreshInterval: number
  refreshOnOpen: boolean
  actionClickBehavior: "popup" | "sidepanel"
  newApiBaseUrl: string
  newApiAdminToken: string
  newApiUserId: string
  veloeraBaseUrl: string
  veloeraAdminToken: string
  veloeraUserId: string
  managedSiteType: ManagedSiteType
  cliProxyBaseUrl: string
  cliProxyManagementKey: string
  claudeCodeRouterBaseUrl: string
  claudeCodeRouterApiKey: string
  themeMode: ThemeMode
  tempWindowFallback: TempWindowFallbackPreferences
  tempWindowFallbackReminder: TempWindowFallbackReminderPreferences

  updateActiveTab: (activeTab: DashboardTabType) => Promise<boolean>
  updateDefaultTab: (activeTab: DashboardTabType) => Promise<boolean>
  updateCurrencyType: (currencyType: CurrencyType) => Promise<boolean>
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
  updateNewApiBaseUrl: (url: string) => Promise<boolean>
  updateNewApiAdminToken: (token: string) => Promise<boolean>
  updateNewApiUserId: (userId: string) => Promise<boolean>
  updateVeloeraBaseUrl: (url: string) => Promise<boolean>
  updateVeloeraAdminToken: (token: string) => Promise<boolean>
  updateVeloeraUserId: (userId: string) => Promise<boolean>
  updateManagedSiteType: (siteType: ManagedSiteType) => Promise<boolean>
  updateCliProxyBaseUrl: (url: string) => Promise<boolean>
  updateCliProxyManagementKey: (key: string) => Promise<boolean>
  updateClaudeCodeRouterBaseUrl: (url: string) => Promise<boolean>
  updateClaudeCodeRouterApiKey: (key: string) => Promise<boolean>
  updateThemeMode: (themeMode: ThemeMode) => Promise<boolean>
  updateAutoCheckin: (
    updates: Partial<AutoCheckinPreferences>,
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
  resetVeloeraConfig: () => Promise<boolean>
  resetNewApiModelSyncConfig: () => Promise<boolean>
  resetCliProxyConfig: () => Promise<boolean>
  resetClaudeCodeRouterConfig: () => Promise<boolean>
  resetAutoCheckinConfig: () => Promise<boolean>
  resetRedemptionAssistConfig: () => Promise<boolean>
  resetModelRedirectConfig: () => Promise<boolean>
  resetWebdavConfig: () => Promise<boolean>
  resetThemeAndLanguage: () => Promise<boolean>
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
      console.error("加载用户偏好设置失败:", error)
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

  if (isLoading || !preferences) {
    return null
  }

  const value = {
    preferences,
    isLoading,
    activeTab: preferences?.activeTab || DATA_TYPE_CASHFLOW,
    currencyType: preferences?.currencyType || "USD",
    sortField: preferences?.sortField || UI_CONSTANTS.SORT.DEFAULT_FIELD,
    sortOrder: preferences?.sortOrder || UI_CONSTANTS.SORT.DEFAULT_ORDER,
    sortingPriorityConfig:
      preferences?.sortingPriorityConfig || DEFAULT_SORTING_PRIORITY_CONFIG,
    autoRefresh: preferences?.accountAutoRefresh?.enabled ?? true,
    refreshInterval: preferences?.accountAutoRefresh?.interval ?? 360,
    minRefreshInterval: preferences?.accountAutoRefresh?.minInterval ?? 60,
    refreshOnOpen: preferences?.accountAutoRefresh?.refreshOnOpen ?? true,
    actionClickBehavior: preferences?.actionClickBehavior ?? "popup",
    newApiBaseUrl: preferences?.newApi?.baseUrl || "",
    newApiAdminToken: preferences?.newApi?.adminToken || "",
    newApiUserId: preferences?.newApi?.userId || "",
    veloeraBaseUrl: preferences?.veloera?.baseUrl || "",
    veloeraAdminToken: preferences?.veloera?.adminToken || "",
    veloeraUserId: preferences?.veloera?.userId || "",
    managedSiteType: preferences?.managedSiteType || NEW_API,
    cliProxyBaseUrl: preferences?.cliProxy?.baseUrl || "",
    cliProxyManagementKey: preferences?.cliProxy?.managementKey || "",
    claudeCodeRouterBaseUrl: preferences?.claudeCodeRouter?.baseUrl || "",
    claudeCodeRouterApiKey: preferences?.claudeCodeRouter?.apiKey || "",
    themeMode: preferences?.themeMode || "system",
    tempWindowFallback:
      preferences.tempWindowFallback ??
      (DEFAULT_PREFERENCES.tempWindowFallback as TempWindowFallbackPreferences),
    tempWindowFallbackReminder:
      preferences.tempWindowFallbackReminder ??
      (DEFAULT_PREFERENCES.tempWindowFallbackReminder as TempWindowFallbackReminderPreferences),
    updateActiveTab,
    updateDefaultTab,
    updateCurrencyType,
    updateSortConfig,
    updateSortingPriorityConfig,
    updateAutoRefresh,
    updateRefreshInterval,
    updateMinRefreshInterval,
    updateRefreshOnOpen,
    updateActionClickBehavior,
    updateNewApiBaseUrl,
    updateNewApiAdminToken,
    updateNewApiUserId,
    updateVeloeraBaseUrl,
    updateVeloeraAdminToken,
    updateVeloeraUserId,
    updateManagedSiteType,
    updateCliProxyBaseUrl,
    updateCliProxyManagementKey,
    updateClaudeCodeRouterBaseUrl,
    updateClaudeCodeRouterApiKey,
    updateThemeMode,
    updateAutoCheckin,
    updateNewApiModelSync,
    updateModelRedirect,
    updateRedemptionAssist,
    updateTempWindowFallback,
    updateTempWindowFallbackReminder,
    resetToDefaults,
    resetDisplaySettings,
    resetAutoRefreshConfig,
    resetNewApiConfig,
    resetVeloeraConfig,
    resetNewApiModelSyncConfig,
    resetCliProxyConfig,
    resetClaudeCodeRouterConfig,
    resetAutoCheckinConfig,
    resetRedemptionAssistConfig,
    resetModelRedirectConfig,
    resetWebdavConfig,
    resetThemeAndLanguage,
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
