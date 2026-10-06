import { useCallback } from "react"

import {
  DATA_TYPE_BALANCE,
  DATA_TYPE_CASHFLOW,
  DATA_TYPE_CONSUMPTION,
  DATA_TYPE_INCOME,
} from "~/constants"
import {
  PreferencesMessageTypes,
  sendPreferencesMessage,
} from "~/services/preferences/messaging"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
  type ToolbarActionClickBehavior,
  type UserPreferences,
} from "~/services/preferences/userPreferences"
import type {
  ActiveSortField,
  CurrencyType,
  DashboardTabType,
  SortOrder,
} from "~/types"
import type { AccountKeyAutoProvisionMode } from "~/types/accountKeyAutoProvisioning"
import type { LogLevel } from "~/types/logging"
import type { SortingPriorityConfig } from "~/types/sorting"
import type { AppearanceUpdates, ThemeMode } from "~/types/theme"
import { createLogger } from "~/utils/core/logger"

import type { PreferenceMutationSession } from "./preferenceContextTypes"

const logger = createLogger("UserPreferencesContext")

/** Groups feature writes and resets while the context owns the live snapshot. */
export function useDisplayPreferenceActions({
  preferences,
  applySuccessfulPreferenceWrite,
  persistPreferenceUpdates,
}: Pick<
  PreferenceMutationSession,
  "preferences" | "applySuccessfulPreferenceWrite" | "persistPreferenceUpdates"
>) {
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
        try {
          const response = await sendPreferencesMessage(
            PreferencesMessageTypes.UpdateActionClickBehavior,
            {
              behavior,
            },
          )
          if (!response.success) {
            logger.warn(
              "Failed to apply action click behavior update",
              new Error(response.error),
            )
          }
        } catch (error) {
          logger.warn("Failed to notify action click behavior update", error)
        }
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

  /** Persists which key requirements should be filled after account creation. */
  const updateAutoProvisionKeyOnAccountAddMode = useCallback(
    async (mode: AccountKeyAutoProvisionMode) => {
      const result =
        await userPreferences.updateAutoProvisionKeyOnAccountAddMode(mode)
      applySuccessfulPreferenceWrite(result, {
        autoProvisionKeyOnAccountAddMode: mode,
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
        preferences?.sortField ?? DEFAULT_PREFERENCES.sortField
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

  const updateAppearance = useCallback(
    async ({ themeMode, ...appearance }: AppearanceUpdates) =>
      persistPreferenceUpdates({
        appearance,
        ...(themeMode ? { themeMode } : {}),
      }),
    [persistPreferenceUpdates],
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
  return {
    updateActiveTab,
    updateActionClickBehavior,
    updateOpenChangelogOnUpdate,
    updateAutoProvisionKeyOnAccountAdd,
    updateAutoProvisionKeyOnAccountAddMode,
    updateAutoFillCurrentSiteUrlOnAccountAdd,
    updateWarnOnDuplicateAccountAdd,
    updateDefaultTab,
    updateCurrencyType,
    updateShowTodayCashflow,
    updateSortConfig,
    updateSortingPriorityConfig,
    updateAppearance,
    updateThemeMode,
    updateLoggingConsoleEnabled,
    updateLoggingLevel,
    resetDisplaySettings,
    resetLoggingSettings,
    resetSortingPriorityConfig,
  }
}
