import { useCallback } from "react"

import {
  AutoRefreshMessageTypes,
  sendAutoRefreshMessage,
} from "~/services/accounts/autoRefreshMessaging"
import { sendAutoCheckinMessage } from "~/services/checkin/autoCheckin/messaging"
import { sendBalanceHistoryMessage } from "~/services/history/dailyBalanceHistory/messaging"
import { sendModelSyncMessage } from "~/services/models/modelSync/messaging"
import {
  PreferencesMessageTypes,
  sendPreferencesMessage,
} from "~/services/preferences/messaging"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
} from "~/services/preferences/userPreferences"
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
import {
  DEFAULT_SITE_ANNOUNCEMENT_PREFERENCES,
  normalizeSiteAnnouncementPreferences,
  type SiteAnnouncementPreferences,
} from "~/types/siteAnnouncements"
import type { DeepPartial } from "~/types/utils"
import type { WebDAVSettings } from "~/types/webdav"
import { deepOverride } from "~/utils"

import type {
  PreferenceMutationSession,
  PreferenceSaveOptions,
} from "./preferenceContextTypes"
import {
  isUserPreferencesSnapshot,
  normalizeRuntimeMutationResponse,
  trackOptionsSettingsSnapshots,
} from "./preferenceSnapshots"

/** Groups feature writes and resets while the context owns the live snapshot. */
export function useRuntimePreferenceActions({
  preferences,
  setPreferences,
  loadPreferences,
  reloadPreferencesAndTrackSnapshots,
  persistPreferenceUpdates,
}: Pick<
  PreferenceMutationSession,
  | "preferences"
  | "setPreferences"
  | "loadPreferences"
  | "reloadPreferencesAndTrackSnapshots"
  | "persistPreferenceUpdates"
>) {
  const updateWebdavSettings = useCallback(
    async (
      updates: DeepPartial<WebDAVSettings>,
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
    [preferences, setPreferences],
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
    [preferences, setPreferences],
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

  const resetWebdavConfig = useCallback(async () => {
    const result = await userPreferences.resetWebdavConfig()
    if (result.ok) {
      await reloadPreferencesAndTrackSnapshots({
        webdav: DEFAULT_PREFERENCES.webdav,
      })
    }
    return result
  }, [reloadPreferencesAndTrackSnapshots])
  return {
    updateWebdavSettings,
    updateWebdavAutoSyncSettings,
    updateSiteAnnouncementNotifications,
    resetToDefaults,
    resetWebdavConfig,
  }
}
