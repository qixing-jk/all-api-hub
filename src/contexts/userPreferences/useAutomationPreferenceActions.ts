import { useCallback } from "react"

import {
  AutoRefreshMessageTypes,
  sendAutoRefreshMessage,
} from "~/services/accounts/autoRefreshMessaging"
import { sendAutoCheckinMessage } from "~/services/checkin/autoCheckin/messaging"
import { sendBalanceHistoryMessage } from "~/services/history/dailyBalanceHistory/messaging"
import { sendModelSyncMessage } from "~/services/models/modelSync/messaging"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { userPreferences } from "~/services/preferences/userPreferences"
import {
  AutoCheckinMessageTypes,
  BalanceHistoryMessageTypes,
  ModelSyncMessageTypes,
} from "~/services/runtimeMessaging/messageTypes"
import type { AutoCheckinPreferences } from "~/types/autoCheckin"
import { type BalanceHistoryPreferences } from "~/types/dailyBalanceHistory"
import type { ModelRedirectPreferences } from "~/types/managedSiteModelRedirect"
import { type TaskNotificationPreferences } from "~/types/taskNotifications"
import type { DeepPartial } from "~/types/utils"

import type {
  PreferenceMutationSession,
  UserManagedSiteModelSyncConfigUpdate,
} from "./preferenceContextTypes"

/** Groups feature writes and resets while the context owns the live snapshot. */
export function useAutomationPreferenceActions({
  applySuccessfulPreferenceWrite,
}: Pick<PreferenceMutationSession, "applySuccessfulPreferenceWrite">) {
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
    async (updates: UserManagedSiteModelSyncConfigUpdate) => {
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

  const updateTaskNotifications = useCallback(
    async (updates: DeepPartial<TaskNotificationPreferences>) => {
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

  const resetModelRedirectConfig = useCallback(async () => {
    const result = await userPreferences.resetModelRedirectConfig()
    applySuccessfulPreferenceWrite(result, {
      modelRedirect: DEFAULT_PREFERENCES.modelRedirect,
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
  return {
    updateAutoRefresh,
    updateRefreshInterval,
    updateMinRefreshInterval,
    updateRefreshOnOpen,
    updateAutoCheckin,
    updateBalanceHistory,
    updateNewApiModelSync,
    updateModelRedirect,
    updateTaskNotifications,
    resetAutoRefreshConfig,
    resetNewApiModelSyncConfig,
    resetAutoCheckinConfig,
    resetModelRedirectConfig,
    resetTaskNotifications,
  }
}
