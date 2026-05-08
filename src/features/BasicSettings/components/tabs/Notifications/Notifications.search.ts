import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import {
  buildControlDefinition,
  buildSectionDefinition,
  DEFAULT_BREADCRUMBS,
} from "~/entrypoints/options/search/registryHelpers"
import type { OptionsSearchItemDefinition } from "~/entrypoints/options/search/types"

const NOTIFICATIONS_TAB_ID = "notifications"

const NOTIFICATIONS_TAB_BREADCRUMBS = [
  ...DEFAULT_BREADCRUMBS,
  "settings:tabs.notifications",
]

const TASK_NOTIFICATION_SETUP_BREADCRUMBS = [
  ...NOTIFICATIONS_TAB_BREADCRUMBS,
  "settings:taskNotifications.groups.setup.title",
]

const TASK_NOTIFICATION_CHANNEL_BREADCRUMBS = [
  ...NOTIFICATIONS_TAB_BREADCRUMBS,
  "settings:taskNotifications.groups.channels.title",
]

const TASK_NOTIFICATION_TASK_BREADCRUMBS = [
  ...NOTIFICATIONS_TAB_BREADCRUMBS,
  "settings:taskNotifications.groups.tasks.title",
]

const TASK_NOTIFICATION_TASK_CONTROL_ORDER_START = 612

const TASK_NOTIFICATION_TASK_SEARCH_CONTROLS = [
  {
    searchId: "control:task-notifications-auto-checkin",
    targetId: SETTINGS_ANCHORS.TASK_NOTIFICATIONS_AUTO_CHECKIN,
    labelKey: "settings:taskNotifications.tasks.autoCheckin",
    descriptionKey: "settings:taskNotifications.taskDescriptions.autoCheckin",
    keywords: ["notification", "auto checkin", "check-in"],
  },
  {
    searchId: "control:task-notifications-webdav-auto-sync",
    targetId: SETTINGS_ANCHORS.TASK_NOTIFICATIONS_WEBDAV_AUTO_SYNC,
    labelKey: "settings:taskNotifications.tasks.webdavAutoSync",
    descriptionKey:
      "settings:taskNotifications.taskDescriptions.webdavAutoSync",
    keywords: ["notification", "webdav", "auto sync"],
  },
  {
    searchId: "control:task-notifications-managed-site-model-sync",
    targetId: SETTINGS_ANCHORS.TASK_NOTIFICATIONS_MANAGED_SITE_MODEL_SYNC,
    labelKey: "settings:taskNotifications.tasks.managedSiteModelSync",
    descriptionKey:
      "settings:taskNotifications.taskDescriptions.managedSiteModelSync",
    keywords: ["notification", "model sync", "managed site"],
  },
  {
    searchId: "control:task-notifications-usage-history-sync",
    targetId: SETTINGS_ANCHORS.TASK_NOTIFICATIONS_USAGE_HISTORY_SYNC,
    labelKey: "settings:taskNotifications.tasks.usageHistorySync",
    descriptionKey:
      "settings:taskNotifications.taskDescriptions.usageHistorySync",
    keywords: ["notification", "usage history", "sync"],
  },
  {
    searchId: "control:task-notifications-balance-history-capture",
    targetId: SETTINGS_ANCHORS.TASK_NOTIFICATIONS_BALANCE_HISTORY_CAPTURE,
    labelKey: "settings:taskNotifications.tasks.balanceHistoryCapture",
    descriptionKey:
      "settings:taskNotifications.taskDescriptions.balanceHistoryCapture",
    keywords: ["notification", "balance history", "capture"],
  },
  {
    searchId: "control:task-notifications-site-announcements",
    targetId: SETTINGS_ANCHORS.TASK_NOTIFICATIONS_SITE_ANNOUNCEMENTS,
    labelKey: "settings:taskNotifications.siteAnnouncements.enable",
    descriptionKey: "settings:taskNotifications.siteAnnouncements.enableDesc",
    keywords: ["notification", "site announcement", "notice"],
  },
] as const

export const notificationsSearchSections: OptionsSearchItemDefinition[] = [
  buildSectionDefinition(
    "section:task-notifications",
    NOTIFICATIONS_TAB_ID,
    SETTINGS_ANCHORS.TASK_NOTIFICATIONS,
    "settings:taskNotifications.groups.setup.title",
    303,
    {
      descriptionKey: "settings:taskNotifications.groups.setup.description",
      keywords: ["notification", "scheduled task", "alarm"],
    },
  ),
  buildSectionDefinition(
    "section:task-notification-channels",
    NOTIFICATIONS_TAB_ID,
    SETTINGS_ANCHORS.TASK_NOTIFICATION_CHANNELS,
    "settings:taskNotifications.groups.channels.title",
    304,
    {
      descriptionKey: "settings:taskNotifications.groups.channels.description",
      keywords: ["notification", "channel", "delivery", "telegram", "webhook"],
    },
  ),
  buildSectionDefinition(
    "section:task-notification-events",
    NOTIFICATIONS_TAB_ID,
    SETTINGS_ANCHORS.TASK_NOTIFICATION_EVENTS,
    "settings:taskNotifications.groups.tasks.title",
    305,
    {
      descriptionKey: "settings:taskNotifications.groups.tasks.description",
      keywords: ["notification", "task", "scheduled task", "event"],
    },
  ),
]

export const notificationsSearchControls: OptionsSearchItemDefinition[] = [
  buildControlDefinition(
    "control:task-notifications-enabled",
    NOTIFICATIONS_TAB_ID,
    SETTINGS_ANCHORS.TASK_NOTIFICATIONS_ENABLED,
    "settings:taskNotifications.enable",
    607,
    {
      descriptionKey: "settings:taskNotifications.enableDesc",
      breadcrumbsKeys: TASK_NOTIFICATION_SETUP_BREADCRUMBS,
      keywords: ["notification", "scheduled task", "background task"],
    },
  ),
  buildControlDefinition(
    "control:task-notifications-channel-browser",
    NOTIFICATIONS_TAB_ID,
    SETTINGS_ANCHORS.TASK_NOTIFICATIONS_CHANNEL_BROWSER,
    "settings:taskNotifications.channels.browser.title",
    608,
    {
      descriptionKey: "settings:taskNotifications.channels.browser.description",
      breadcrumbsKeys: TASK_NOTIFICATION_CHANNEL_BREADCRUMBS,
      keywords: ["notification", "browser", "system notification"],
    },
  ),
  buildControlDefinition(
    "control:task-notifications-permission",
    NOTIFICATIONS_TAB_ID,
    SETTINGS_ANCHORS.TASK_NOTIFICATIONS_PERMISSION,
    "settings:taskNotifications.permission.title",
    609,
    {
      descriptionKey: "settings:taskNotifications.permission.description",
      breadcrumbsKeys: TASK_NOTIFICATION_CHANNEL_BREADCRUMBS,
      keywords: ["notification", "permission", "system notification"],
    },
  ),
  buildControlDefinition(
    "control:task-notifications-channel-telegram",
    NOTIFICATIONS_TAB_ID,
    SETTINGS_ANCHORS.TASK_NOTIFICATIONS_CHANNEL_TELEGRAM,
    "settings:taskNotifications.channels.telegram.title",
    610,
    {
      descriptionKey:
        "settings:taskNotifications.channels.telegram.description",
      breadcrumbsKeys: TASK_NOTIFICATION_CHANNEL_BREADCRUMBS,
      keywords: ["notification", "telegram", "bot"],
    },
  ),
  buildControlDefinition(
    "control:task-notifications-channel-webhook",
    NOTIFICATIONS_TAB_ID,
    SETTINGS_ANCHORS.TASK_NOTIFICATIONS_CHANNEL_WEBHOOK,
    "settings:taskNotifications.channels.webhook.title",
    611,
    {
      descriptionKey: "settings:taskNotifications.channels.webhook.description",
      breadcrumbsKeys: TASK_NOTIFICATION_CHANNEL_BREADCRUMBS,
      keywords: ["notification", "webhook", "http"],
    },
  ),
  ...TASK_NOTIFICATION_TASK_SEARCH_CONTROLS.map((definition, index) =>
    buildControlDefinition(
      definition.searchId,
      NOTIFICATIONS_TAB_ID,
      definition.targetId,
      definition.labelKey,
      TASK_NOTIFICATION_TASK_CONTROL_ORDER_START + index,
      {
        descriptionKey: definition.descriptionKey,
        breadcrumbsKeys: TASK_NOTIFICATION_TASK_BREADCRUMBS,
        keywords: [...definition.keywords],
      },
    ),
  ),
]
