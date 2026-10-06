import type { ReactNode } from "react"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"

import { Storage, type StorageCallbackMap } from "@plasmohq/storage"

import {
  DATA_TYPE_BALANCE,
  DATA_TYPE_CASHFLOW,
  DATA_TYPE_CONSUMPTION,
  DATA_TYPE_INCOME,
} from "~/constants"
import { SITE_TYPES } from "~/constants/siteType"
import { DEFAULT_THEME_MODE } from "~/constants/theme"
import { USER_PREFERENCES_STORAGE_KEYS } from "~/services/core/storageKeys"
import {
  DEFAULT_PREFERENCES,
  TOOLBAR_ACTION_CLICK_BEHAVIORS,
  userPreferences,
  type PreferenceWriteResult,
  type TempWindowFallbackPreferences,
  type TempWindowFallbackReminderPreferences,
  type UserPreferences,
} from "~/services/preferences/userPreferences"
import { DEFAULT_SORTING_PRIORITY_CONFIG } from "~/services/preferences/utils/sortingPriority"
import { DEFAULT_ACCOUNT_AUTO_REFRESH } from "~/types/accountAutoRefresh"
import { DEFAULT_AXON_HUB_CONFIG } from "~/types/axonHubConfig"
import { DEFAULT_CLAUDE_CODE_HUB_CONFIG } from "~/types/claudeCodeHubConfig"
import { DEFAULT_GPT_LOAD_CONFIG } from "~/types/gptLoadConfig"
import { DEFAULT_OMNIROUTE_CONFIG } from "~/types/omnirouteConfig"
import { normalizeSiteAnnouncementPreferences } from "~/types/siteAnnouncements"
import { DEFAULT_SUB2API_MANAGED_SITE_CONFIG } from "~/types/sub2apiManagedSiteConfig"
import { normalizeTaskNotificationPreferences } from "~/types/taskNotifications"
import type { DeepPartial } from "~/types/utils"
import { createLogger } from "~/utils/core/logger"
import { normalizeThemePreferences } from "~/utils/ui/themePreferences"

import type {
  PreferenceSaveOptions,
  UserPreferencesContextType,
} from "./userPreferences/preferenceContextTypes"
import {
  normalizeContextPreferenceSnapshot,
  savePreferencesWithOptions,
  trackOptionsSettingsSnapshots,
} from "./userPreferences/preferenceSnapshots"
import { useAutomationPreferenceActions } from "./userPreferences/useAutomationPreferenceActions"
import { useContentScriptPreferenceActions } from "./userPreferences/useContentScriptPreferenceActions"
import { useDisplayPreferenceActions } from "./userPreferences/useDisplayPreferenceActions"
import { useManagedSitePreferenceActions } from "./userPreferences/useManagedSitePreferenceActions"
import { useRuntimePreferenceActions } from "./userPreferences/useRuntimePreferenceActions"

const logger = createLogger("UserPreferencesContext")

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

  const latestThemeStorageChangeRef = useRef<ReturnType<
    typeof normalizeThemePreferences
  > | null>(null)

  /** Preserve theme events received while the persisted snapshot is loading. */
  const hydratePreferences = useCallback(async () => {
    const themeBeforeRead = latestThemeStorageChangeRef.current
    const prefs = await userPreferences.getPreferences()
    const snapshot = normalizeContextPreferenceSnapshot(prefs)
    const themeAfterRead = latestThemeStorageChangeRef.current
    const nextPreferences =
      themeAfterRead && themeAfterRead !== themeBeforeRead
        ? { ...snapshot, ...themeAfterRead }
        : snapshot
    setPreferences(nextPreferences)
    return nextPreferences
  }, [])

  /**
   * Fetch the latest preference snapshot from storage and hydrate local state.
   * Exposes the pending read through the `isLoading` flag.
   */
  const loadPreferences = useCallback(async () => {
    try {
      setIsLoading(true)
      await hydratePreferences()
    } catch (error) {
      logger.error("加载用户偏好设置失败", error)
    } finally {
      setIsLoading(false)
    }
  }, [hydratePreferences])
  // Plasmo decodes stored JSON and supports both Chrome and Firefox listeners.

  useEffect(() => {
    const storage = new Storage({ area: "local" })
    const callbacks: StorageCallbackMap = {
      [USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES]: ({ newValue }) => {
        const themePreferences = normalizeThemePreferences(newValue)
        latestThemeStorageChangeRef.current = themePreferences
        setPreferences((current) =>
          current
            ? {
                ...current,
                ...themePreferences,
              }
            : current,
        )
      },
    }
    storage.watch(callbacks)
    return () => {
      storage.unwatch(callbacks)
    }
  }, [])

  const reloadPreferencesAndTrackSnapshots = useCallback(
    async (updates: DeepPartial<UserPreferences>) => {
      try {
        setIsLoading(true)
        const nextPreferences = await hydratePreferences()
        trackOptionsSettingsSnapshots(nextPreferences, updates)
      } catch (error) {
        logger.error("加载用户偏好设置失败", error)
      } finally {
        setIsLoading(false)
      }
    },
    [hydratePreferences],
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

  const mutationSession = {
    preferences,
    setPreferences,
    loadPreferences,
    reloadPreferencesAndTrackSnapshots,
    applySuccessfulPreferenceWrite,
    persistPreferenceUpdates,
  }

  const actions = {
    ...useManagedSitePreferenceActions(mutationSession),
    ...useAutomationPreferenceActions(mutationSession),
    ...useContentScriptPreferenceActions(mutationSession),
    ...useRuntimePreferenceActions(mutationSession),
    ...useDisplayPreferenceActions(mutationSession),
  }

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
    ...actions,
    preferences,
    isLoading,
    activeTab: preferences?.activeTab || DATA_TYPE_CASHFLOW,
    currencyType: preferences?.currencyType || "USD",
    showTodayCashflow: preferences?.showTodayCashflow ?? true,
    sortField:
      preferences?.sortField === undefined
        ? DEFAULT_PREFERENCES.sortField
        : preferences.sortField,
    sortOrder: preferences?.sortOrder || DEFAULT_PREFERENCES.sortOrder,
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
    autoProvisionKeyOnAccountAddMode:
      preferences?.autoProvisionKeyOnAccountAddMode ??
      DEFAULT_PREFERENCES.autoProvisionKeyOnAccountAddMode,
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
    sub2ApiManagedSiteBaseUrl:
      preferences?.sub2apiManagedSite?.baseUrl ||
      DEFAULT_SUB2API_MANAGED_SITE_CONFIG.baseUrl,
    sub2ApiManagedSiteAdminToken:
      preferences?.sub2apiManagedSite?.adminToken ||
      DEFAULT_SUB2API_MANAGED_SITE_CONFIG.adminToken,
    omniRouteBaseUrl:
      preferences?.omniroute?.baseUrl || DEFAULT_OMNIROUTE_CONFIG.baseUrl,
    omniRouteToken:
      preferences?.omniroute?.token || DEFAULT_OMNIROUTE_CONFIG.token,
    gptLoadBaseUrl:
      preferences?.gptLoad?.baseUrl || DEFAULT_GPT_LOAD_CONFIG.baseUrl,
    gptLoadManagementKey:
      preferences?.gptLoad?.managementKey ||
      DEFAULT_GPT_LOAD_CONFIG.managementKey,
    managedSiteType: preferences?.managedSiteType || SITE_TYPES.NEW_API,
    cliProxyApiBaseUrl: preferences?.cliProxyApi?.baseUrl || "",
    cliProxyApiManagementKey: preferences?.cliProxyApi?.adminToken || "",
    claudeCodeRouterBaseUrl: preferences?.claudeCodeRouter?.baseUrl || "",
    claudeCodeRouterApiKey: preferences?.claudeCodeRouter?.apiKey || "",
    themeMode: preferences?.themeMode || DEFAULT_THEME_MODE,
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
