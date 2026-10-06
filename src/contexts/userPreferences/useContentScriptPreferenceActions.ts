import { useCallback } from "react"

import { DEFAULT_REDEMPTION_ASSIST_PREFERENCES } from "~/services/preferences/contentScriptFeatureDefaults"
import {
  PreferencesMessageTypes,
  sendPreferencesMessage,
} from "~/services/preferences/messaging"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
  type RedemptionAssistPreferences,
  type TempWindowFallbackPreferences,
  type TempWindowFallbackReminderPreferences,
  type WebAiApiCheckPreferences,
} from "~/services/preferences/userPreferences"
import {
  RedemptionAssistMessageTypes,
  sendRedemptionAssistMessage,
} from "~/services/redemption/redemptionAssistMessaging"
import type { DeepPartial } from "~/types/utils"

import type { PreferenceMutationSession } from "./preferenceContextTypes"

/** Groups feature writes and resets while the context owns the live snapshot. */
export function useContentScriptPreferenceActions({
  applySuccessfulPreferenceWrite,
}: Pick<PreferenceMutationSession, "applySuccessfulPreferenceWrite">) {
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

  const updateRedemptionAssist = useCallback(
    async (updates: DeepPartial<RedemptionAssistPreferences>) => {
      const preferenceUpdates = {
        redemptionAssist: updates,
      }
      const result =
        await userPreferences.savePreferencesWithResult(preferenceUpdates)
      const nextPreferences = applySuccessfulPreferenceWrite(
        result,
        preferenceUpdates,
      )
      if (nextPreferences) {
        const savedSettings =
          nextPreferences.redemptionAssist ??
          DEFAULT_REDEMPTION_ASSIST_PREFERENCES
        const runtimeSettings: Partial<RedemptionAssistPreferences> = {}
        if (typeof updates.enabled === "boolean") {
          runtimeSettings.enabled = savedSettings.enabled
        }
        if (updates.contextMenu) {
          runtimeSettings.contextMenu = savedSettings.contextMenu
        }
        if (typeof updates.relaxedCodeValidation === "boolean") {
          runtimeSettings.relaxedCodeValidation =
            savedSettings.relaxedCodeValidation
        }
        if (updates.urlWhitelist) {
          runtimeSettings.urlWhitelist = savedSettings.urlWhitelist
        }
        void sendRedemptionAssistMessage(
          RedemptionAssistMessageTypes.UpdateSettings,
          {
            settings: runtimeSettings,
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
  return {
    updateTempWindowFallbackReminder,
    updateRedemptionAssist,
    updateWebAiApiCheck,
    updateTempWindowFallback,
    resetRedemptionAssistConfig,
    resetWebAiApiCheckConfig,
  }
}
