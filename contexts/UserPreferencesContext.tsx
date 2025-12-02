import type { ReactNode } from "react"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState
} from "react"

import { DATA_TYPE_CONSUMPTION } from "~/constants"
import { UI_CONSTANTS } from "~/constants/ui"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
  type TempWindowFallbackPreferences,
  type UserPreferences
} from "~/services/userPreferences"
import type { BalanceType, CurrencyType, SortField, SortOrder } from "~/types"
import type { AutoCheckinPreferences } from "~/types/autoCheckin"
import type { ModelRedirectPreferences } from "~/types/modelRedirect"
import type { SortingPriorityConfig } from "~/types/sorting"
import type { ThemeMode } from "~/types/theme"
import { deepOverride } from "~/utils"
import { sendRuntimeMessage } from "~/utils/browserApi"
import { DEFAULT_SORTING_PRIORITY_CONFIG } from "~/utils/sortingPriority"

type UserNewApiModelSyncConfig = NonNullable<UserPreferences["newApiModelSync"]>

// 1. 定义 Context 的值类型
interface UserPreferencesContextType {
  preferences: UserPreferences
  isLoading: boolean
  activeTab: BalanceType
  currencyType: CurrencyType
  sortingPriorityConfig: SortingPriorityConfig
  sortField: SortField
  sortOrder: SortOrder
  autoRefresh: boolean
  refreshInterval: number
  minRefreshInterval: number
  refreshOnOpen: boolean
  newApiBaseUrl: string
  newApiAdminToken: string
  newApiUserId: string
  cliProxyBaseUrl: string
  cliProxyManagementKey: string
  themeMode: ThemeMode
  tempWindowFallback: TempWindowFallbackPreferences

  updateActiveTab: (activeTab: BalanceType) => Promise<boolean>
  updateDefaultTab: (activeTab: BalanceType) => Promise<boolean>
  updateCurrencyType: (currencyType: CurrencyType) => Promise<boolean>
  updateSortConfig: (
    sortField: SortField,
    sortOrder: SortOrder
  ) => Promise<boolean>
  updateSortingPriorityConfig: (
    sortingPriority: SortingPriorityConfig
  ) => Promise<boolean>
  updateAutoRefresh: (enabled: boolean) => Promise<boolean>
  updateRefreshInterval: (interval: number) => Promise<boolean>
  updateMinRefreshInterval: (interval: number) => Promise<boolean>
  updateRefreshOnOpen: (enabled: boolean) => Promise<boolean>
  updateNewApiBaseUrl: (url: string) => Promise<boolean>
  updateNewApiAdminToken: (token: string) => Promise<boolean>
  updateNewApiUserId: (userId: string) => Promise<boolean>
  updateCliProxyBaseUrl: (url: string) => Promise<boolean>
  updateCliProxyManagementKey: (key: string) => Promise<boolean>
  updateThemeMode: (themeMode: ThemeMode) => Promise<boolean>
  updateAutoCheckin: (
    updates: Partial<AutoCheckinPreferences>
  ) => Promise<boolean>
  updateNewApiModelSync: (
    updates: Partial<UserNewApiModelSyncConfig>
  ) => Promise<boolean>
  updateModelRedirect: (
    updates: Partial<ModelRedirectPreferences>
  ) => Promise<boolean>
  updateRedemptionAssist: (updates: { enabled: boolean }) => Promise<boolean>
  updateTempWindowFallback: (
    updates: Partial<TempWindowFallbackPreferences>
  ) => Promise<boolean>
  resetToDefaults: () => Promise<boolean>
  resetDisplaySettings: () => Promise<boolean>
  resetAutoRefreshConfig: () => Promise<boolean>
  resetNewApiConfig: () => Promise<boolean>
  resetNewApiModelSyncConfig: () => Promise<boolean>
  resetCliProxyConfig: () => Promise<boolean>
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

// 3. 创建 Provider 组件
export const UserPreferencesProvider = ({
  children
}: {
  children: ReactNode
}) => {
  const [preferences, setPreferences] = useState<UserPreferences | null>(null)
  const [isLoading, setIsLoading] = useState(true)

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

  const updateActiveTab = useCallback(async (activeTab: BalanceType) => {
    const success = await userPreferences.updateActiveTab(activeTab)
    if (success) {
      setPreferences((prev) => (prev ? { ...prev, activeTab } : null))
    }
    return success
  }, [])

  const updateCliProxyBaseUrl = useCallback(async (baseUrl: string) => {
    const updates = {
      cliProxy: { baseUrl }
    }
    const success = await userPreferences.savePreferences(updates)
    if (success) {
      setPreferences((prev) => (prev ? deepOverride(prev, updates) : null))
    }
    return success
  }, [])

  const updateCliProxyManagementKey = useCallback(
    async (managementKey: string) => {
      const updates = {
        cliProxy: { managementKey }
      }
      const success = await userPreferences.savePreferences(updates)
      if (success) {
        setPreferences((prev) => (prev ? deepOverride(prev, updates) : null))
      }
      return success
    },
    []
  )

  const updateDefaultTab = useCallback(async (activeTab: BalanceType) => {
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
        sortOrder
      )
      if (success) {
        setPreferences((prev) =>
          prev ? { ...prev, sortField, sortOrder } : null
        )
      }
      return success
    },
    []
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
                sortingPriorityConfig: sortingPriority
              }
            : null
        )
      }
      return success
    },
    []
  )

  const updateAutoRefresh = useCallback(async (enabled: boolean) => {
    const updates = {
      accountAutoRefresh: { enabled: enabled }
    }
    const success = await userPreferences.savePreferences(updates)
    if (success) {
      setPreferences((prev) => (prev ? deepOverride(prev, updates) : null))
      sendRuntimeMessage({
        action: "updateAutoRefreshSettings",
        settings: updates
      })
    }
    return success
  }, [])

  const updateRefreshInterval = useCallback(async (interval: number) => {
    const updates = {
      accountAutoRefresh: { interval: interval }
    }
    const success = await userPreferences.savePreferences(updates)
    if (success) {
      setPreferences((prev) => (prev ? deepOverride(prev, updates) : null))
      sendRuntimeMessage({
        action: "updateAutoRefreshSettings",
        settings: updates
      })
    }
    return success
  }, [])

  const updateMinRefreshInterval = useCallback(async (minInterval: number) => {
    const updates = {
      accountAutoRefresh: { minInterval: minInterval }
    }
    const success = await userPreferences.savePreferences(updates)
    if (success) {
      setPreferences((prev) => (prev ? deepOverride(prev, updates) : null))
      sendRuntimeMessage({
        action: "updateAutoRefreshSettings",
        settings: updates
      })
    }
    return success
  }, [])

  const updateRefreshOnOpen = useCallback(async (refreshOnOpen: boolean) => {
    const updates = {
      accountAutoRefresh: { refreshOnOpen: refreshOnOpen }
    }
    const success = await userPreferences.savePreferences(updates)
    if (success) {
      setPreferences((prev) => (prev ? deepOverride(prev, updates) : null))
      sendRuntimeMessage({
        action: "updateAutoRefreshSettings",
        settings: updates
      })
    }
    return success
  }, [])

  const updateNewApiBaseUrl = useCallback(async (baseUrl: string) => {
    const updates = {
      newApi: { baseUrl }
    }
    const success = await userPreferences.savePreferences(updates)
    if (success) {
      setPreferences((prev) => (prev ? deepOverride(prev, updates) : null))
    }
    return success
  }, [])

  const updateNewApiAdminToken = useCallback(async (adminToken: string) => {
    const updates = {
      newApi: { adminToken }
    }
    const success = await userPreferences.savePreferences(updates)
    if (success) {
      setPreferences((prev) => (prev ? deepOverride(prev, updates) : null))
    }
    return success
  }, [])

  const updateNewApiUserId = useCallback(async (userId: string) => {
    const updates = {
      newApi: { userId }
    }
    const success = await userPreferences.savePreferences(updates)
    if (success) {
      setPreferences((prev) => (prev ? deepOverride(prev, updates) : null))
    }
    return success
  }, [])

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
        autoCheckin: updates
      })

      if (success) {
        setPreferences((prev) => {
          if (!prev) return null
          const merged = deepOverride(
            prev.autoCheckin ?? DEFAULT_PREFERENCES.autoCheckin,
            updates
          )
          return {
            ...prev,
            autoCheckin: merged
          }
        })

        // Notify background to update alarm
        await sendRuntimeMessage({
          action: "autoCheckin:updateSettings",
          settings: updates
        })
      }
      return success
    },
    []
  )

  const updateNewApiModelSync = useCallback(
    async (updates: Partial<UserNewApiModelSyncConfig>) => {
      const success = await userPreferences.savePreferences({
        newApiModelSync: updates
      })
      if (success) {
        setPreferences((prev) => {
          if (!prev) return null
          const merged = deepOverride(
            prev.newApiModelSync ?? DEFAULT_PREFERENCES.newApiModelSync,
            updates
          )
          return {
            ...prev,
            newApiModelSync: merged
          }
        })

        // Notify background to update alarm
        await sendRuntimeMessage({
          action: "newApiModelSync:updateSettings",
          settings: updates
        })
      }
      return success
    },
    []
  )

  const updateModelRedirect = useCallback(
    async (updates: Partial<ModelRedirectPreferences>) => {
      const success = await userPreferences.savePreferences({
        modelRedirect: updates
      })
      if (success) {
        setPreferences((prev) => {
          if (!prev) return null
          const merged = deepOverride(
            prev.modelRedirect ?? DEFAULT_PREFERENCES.modelRedirect,
            updates
          )
          return {
            ...prev,
            modelRedirect: merged
          }
        })
      }
      return success
    },
    []
  )

  const updateRedemptionAssist = useCallback(
    async (updates: { enabled: boolean }) => {
      const success = await userPreferences.savePreferences({
        redemptionAssist: updates
      })

      if (success) {
        setPreferences((prev) => {
          if (!prev) return null
          const merged = {
            ...(DEFAULT_PREFERENCES.redemptionAssist ?? { enabled: true }),
            ...(prev.redemptionAssist ?? {}),
            ...updates
          }
          return {
            ...prev,
            redemptionAssist: merged,
            lastUpdated: Date.now()
          }
        })

        await sendRuntimeMessage({
          action: "redemptionAssist:updateSettings",
          settings: updates
        })
      }

      return success
    },
    []
  )

  const updateTempWindowFallback = useCallback(
    async (updates: Partial<TempWindowFallbackPreferences>) => {
      const success = await userPreferences.savePreferences({
        tempWindowFallback: updates
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
              useForManualRefresh: true
            }),
            ...(prev.tempWindowFallback ?? {}),
            ...updates
          }
          return {
            ...prev,
            tempWindowFallback: merged,
            lastUpdated: Date.now()
          }
        })
      }
      return success
    },
    []
  )

  const resetToDefaults = useCallback(async () => {
    const success = await userPreferences.resetToDefaults()
    if (success) {
      await loadPreferences()

      // Notify all background services about the reset
      const defaults = DEFAULT_PREFERENCES

      // Notify auto-refresh service
      sendRuntimeMessage({
        action: "updateAutoRefreshSettings",
        settings: { accountAutoRefresh: defaults.accountAutoRefresh }
      })

      // Notify auto-checkin service
      if (defaults.autoCheckin) {
        void sendRuntimeMessage({
          action: "autoCheckin:updateSettings",
          settings: defaults.autoCheckin
        })
      }

      // Notify New API model sync service
      if (defaults.newApiModelSync) {
        void sendRuntimeMessage({
          action: "newApiModelSync:updateSettings",
          settings: defaults.newApiModelSync
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
              lastUpdated: now
            }
          : prev
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
              lastUpdated: Date.now()
            })
          : prev
      )
      sendRuntimeMessage({
        action: "updateAutoRefreshSettings",
        settings: { accountAutoRefresh: defaults }
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
              lastUpdated: Date.now()
            })
          : prev
      )
    }
    return success
  }, [])

  const resetNewApiModelSyncConfig = useCallback(async () => {
    const success = await userPreferences.resetNewApiModelSyncConfig()
    if (success) {
      const defaults = DEFAULT_PREFERENCES.newApiModelSync
      setPreferences((prev) =>
        prev
          ? deepOverride(prev, {
              newApiModelSync: defaults,
              lastUpdated: Date.now()
            })
          : prev
      )
      if (defaults) {
        void sendRuntimeMessage({
          action: "newApiModelSync:updateSettings",
          settings: defaults
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
              lastUpdated: Date.now()
            })
          : prev
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
              lastUpdated: Date.now()
            })
          : prev
      )
      if (defaults) {
        void sendRuntimeMessage({
          action: "autoCheckin:updateSettings",
          settings: defaults
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
              lastUpdated: Date.now()
            })
          : prev
      )
      if (defaults) {
        void sendRuntimeMessage({
          action: "redemptionAssist:updateSettings",
          settings: defaults
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
              lastUpdated: Date.now()
            })
          : prev
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
              lastUpdated: Date.now()
            })
          : prev
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
              lastUpdated: now
            }
          : prev
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
              lastUpdated: Date.now()
            }
          : prev
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
    activeTab: preferences?.activeTab || DATA_TYPE_CONSUMPTION,
    currencyType: preferences?.currencyType || "USD",
    sortField: preferences?.sortField || UI_CONSTANTS.SORT.DEFAULT_FIELD,
    sortOrder: preferences?.sortOrder || UI_CONSTANTS.SORT.DEFAULT_ORDER,
    sortingPriorityConfig:
      preferences?.sortingPriorityConfig || DEFAULT_SORTING_PRIORITY_CONFIG,
    autoRefresh: preferences?.accountAutoRefresh?.enabled ?? true,
    refreshInterval: preferences?.accountAutoRefresh?.interval ?? 360,
    minRefreshInterval: preferences?.accountAutoRefresh?.minInterval ?? 60,
    refreshOnOpen: preferences?.accountAutoRefresh?.refreshOnOpen ?? true,
    newApiBaseUrl: preferences?.newApi?.baseUrl || "",
    newApiAdminToken: preferences?.newApi?.adminToken || "",
    newApiUserId: preferences?.newApi?.userId || "",
    cliProxyBaseUrl: preferences?.cliProxy?.baseUrl || "",
    cliProxyManagementKey: preferences?.cliProxy?.managementKey || "",
    themeMode: preferences?.themeMode || "system",
    tempWindowFallback:
      preferences.tempWindowFallback ??
      (DEFAULT_PREFERENCES.tempWindowFallback as TempWindowFallbackPreferences),
    updateActiveTab,
    updateDefaultTab,
    updateCurrencyType,
    updateSortConfig,
    updateSortingPriorityConfig,
    updateAutoRefresh,
    updateRefreshInterval,
    updateMinRefreshInterval,
    updateRefreshOnOpen,
    updateNewApiBaseUrl,
    updateNewApiAdminToken,
    updateNewApiUserId,
    updateCliProxyBaseUrl,
    updateCliProxyManagementKey,
    updateThemeMode,
    updateAutoCheckin,
    updateNewApiModelSync,
    updateModelRedirect,
    updateRedemptionAssist,
    updateTempWindowFallback,
    resetToDefaults,
    resetDisplaySettings,
    resetAutoRefreshConfig,
    resetNewApiConfig,
    resetNewApiModelSyncConfig,
    resetCliProxyConfig,
    resetAutoCheckinConfig,
    resetRedemptionAssistConfig,
    resetModelRedirectConfig,
    resetWebdavConfig,
    resetThemeAndLanguage,
    resetSortingPriorityConfig,
    loadPreferences
  }

  return (
    <UserPreferencesContext.Provider value={value}>
      {children}
    </UserPreferencesContext.Provider>
  )
}

// 4. 创建自定义 Hook
export const useUserPreferencesContext = () => {
  const context = useContext(UserPreferencesContext)
  if (!context) {
    throw new Error(
      "useUserPreferencesContext 必须在 UserPreferencesProvider 中使用"
    )
  }
  return context
}
