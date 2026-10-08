import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { type UserPreferences } from "~/services/preferences/preferencesSchema"
import {
  PRODUCT_ANALYTICS_SETTING_IDS,
  type ProductAnalyticsEntrypoint,
} from "~/services/productAnalytics/contracts"
import { getWebdavSyncStrategyMode } from "~/services/productAnalytics/webDavSync"
import { normalizeSiteAnnouncementPreferences } from "~/types/siteAnnouncements"
import {
  normalizeTaskNotificationPreferences,
  TASK_NOTIFICATION_CHANNELS,
  TASK_NOTIFICATION_TASKS,
} from "~/types/taskNotifications"
import {
  CLOUD_SYNC_PROVIDERS,
  resolveWebdavSyncDataSelection,
} from "~/types/webdav"

import {
  hasText,
  normalizeNonNegativeInteger,
  normalizeNonNegativeMinutes,
  type SettingChangedPayload,
} from "./values"
import type { SettingsSnapshotProjection } from "./values"

/** Project webdav into privacy-reviewed analytics facts. */
function buildWebdavSnapshot(
  preferences: UserPreferences,
  entrypoint: ProductAnalyticsEntrypoint,
): SettingChangedPayload {
  const config = preferences.webdav ?? DEFAULT_PREFERENCES.webdav
  const syncData = resolveWebdavSyncDataSelection(config.syncData)
  const isGithubGist = config.provider === CLOUD_SYNC_PROVIDERS.GITHUB_GIST
  return {
    setting_id: PRODUCT_ANALYTICS_SETTING_IDS.WebDavConfigSnapshot,
    entrypoint,
    configured: isGithubGist
      ? hasText(config.githubGist?.token) &&
        hasText(config.githubGist?.gistId) &&
        hasText(config.backupEncryptionPassword)
      : hasText(config.url) && hasText(config.username),
    auto_sync_enabled: config.autoSync === true,
    backup_encryption_enabled:
      isGithubGist || config.backupEncryptionEnabled === true,
    sync_strategy: getWebdavSyncStrategyMode(config.syncStrategy),
    sync_interval_minutes: normalizeNonNegativeMinutes(
      config.syncInterval / 60,
    ),
    sync_accounts_enabled: syncData.accounts,
    sync_bookmarks_enabled: syncData.bookmarks,
    sync_api_profiles_enabled: syncData.apiCredentialProfiles,
    sync_preferences_enabled: syncData.preferences,
  }
}

/** Project task notifications into privacy-reviewed analytics facts. */
function buildTaskNotificationsSnapshot(
  preferences: UserPreferences,
  entrypoint: ProductAnalyticsEntrypoint,
): SettingChangedPayload {
  const config = normalizeTaskNotificationPreferences(
    preferences.taskNotifications,
  )
  const thirdPartyChannelCount = [
    config.channels[TASK_NOTIFICATION_CHANNELS.Telegram].enabled,
    config.channels[TASK_NOTIFICATION_CHANNELS.Feishu].enabled,
    config.channels[TASK_NOTIFICATION_CHANNELS.Dingtalk].enabled,
    config.channels[TASK_NOTIFICATION_CHANNELS.Wecom].enabled,
    config.channels[TASK_NOTIFICATION_CHANNELS.Ntfy].enabled,
    config.channels[TASK_NOTIFICATION_CHANNELS.Webhook].enabled,
  ].filter(Boolean).length
  const taskEnabledCount = Object.values(config.tasks).filter(Boolean).length

  return {
    setting_id: PRODUCT_ANALYTICS_SETTING_IDS.TaskNotificationsConfigSnapshot,
    entrypoint,
    enabled: config.enabled === true,
    browser_channel_enabled:
      config.channels[TASK_NOTIFICATION_CHANNELS.Browser].enabled === true,
    telegram_channel_enabled:
      config.channels[TASK_NOTIFICATION_CHANNELS.Telegram].enabled === true,
    feishu_channel_enabled:
      config.channels[TASK_NOTIFICATION_CHANNELS.Feishu].enabled === true,
    dingtalk_channel_enabled:
      config.channels[TASK_NOTIFICATION_CHANNELS.Dingtalk].enabled === true,
    wecom_channel_enabled:
      config.channels[TASK_NOTIFICATION_CHANNELS.Wecom].enabled === true,
    ntfy_channel_enabled:
      config.channels[TASK_NOTIFICATION_CHANNELS.Ntfy].enabled === true,
    webhook_channel_enabled:
      config.channels[TASK_NOTIFICATION_CHANNELS.Webhook].enabled === true,
    auto_checkin_task_enabled:
      config.tasks[TASK_NOTIFICATION_TASKS.AutoCheckin] === true,
    webdav_auto_sync_task_enabled:
      config.tasks[TASK_NOTIFICATION_TASKS.WebdavAutoSync] === true,
    managed_site_model_sync_task_enabled:
      config.tasks[TASK_NOTIFICATION_TASKS.ManagedSiteModelSync] === true,
    usage_history_sync_task_enabled:
      config.tasks[TASK_NOTIFICATION_TASKS.UsageHistorySync] === true,
    balance_history_capture_task_enabled:
      config.tasks[TASK_NOTIFICATION_TASKS.BalanceHistoryCapture] === true,
    site_announcements_task_enabled:
      config.tasks[TASK_NOTIFICATION_TASKS.SiteAnnouncements] === true,
    third_party_channel_count: thirdPartyChannelCount,
    task_enabled_count: taskEnabledCount,
  }
}

/** Project site announcements into privacy-reviewed analytics facts. */
function buildSiteAnnouncementsSnapshot(
  preferences: UserPreferences,
  entrypoint: ProductAnalyticsEntrypoint,
): SettingChangedPayload {
  const config = normalizeSiteAnnouncementPreferences(
    preferences.siteAnnouncementNotifications,
  )
  return {
    setting_id: PRODUCT_ANALYTICS_SETTING_IDS.SiteAnnouncementsConfigSnapshot,
    entrypoint,
    enabled: config.enabled === true,
    notification_enabled: config.notificationEnabled === true,
    polling_interval_minutes: normalizeNonNegativeInteger(
      config.intervalMinutes,
    ),
  }
}

/** Keep patch attribution beside the safe projection of each settings area. */
export const integrationsSettingsSnapshots = {
  webdav: { keys: ["webdav"], build: buildWebdavSnapshot },
  taskNotifications: {
    keys: ["taskNotifications"],
    build: buildTaskNotificationsSnapshot,
  },
  siteAnnouncements: {
    keys: ["siteAnnouncementNotifications"],
    build: buildSiteAnnouncementsSnapshot,
  },
} satisfies Record<string, SettingsSnapshotProjection>
