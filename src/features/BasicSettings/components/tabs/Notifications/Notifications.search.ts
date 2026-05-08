import {
  buildControlDefinition,
  buildSectionDefinition,
  DEFAULT_BREADCRUMBS,
} from "~/entrypoints/options/search/registryHelpers"
import type { OptionsSearchItemDefinition } from "~/entrypoints/options/search/types"

const NOTIFICATIONS_TAB_ID = "notifications"

const NOTIFICATION_TAB_BREADCRUMBS = [
  ...DEFAULT_BREADCRUMBS,
  "settings:tabs.notifications",
]

const TASK_NOTIFICATION_SETUP_BREADCRUMBS = [
  ...NOTIFICATION_TAB_BREADCRUMBS,
  "settings:taskNotifications.groups.setup.title",
]

const TASK_NOTIFICATION_CHANNEL_BREADCRUMBS = [
  ...NOTIFICATION_TAB_BREADCRUMBS,
  "settings:taskNotifications.groups.channels.title",
]

const TASK_NOTIFICATION_TASK_BREADCRUMBS = [
  ...NOTIFICATION_TAB_BREADCRUMBS,
  "settings:taskNotifications.groups.tasks.title",
]

const TASK_NOTIFICATION_TASK_CONTROL_ORDER_START = 512

const TASK_NOTIFICATION_TASK_SEARCH_CONTROLS = [
  {
    searchId: "control:task-notifications-auto-checkin",
    targetId: "task-notifications-autoCheckin",
    labelKey: "settings:taskNotifications.tasks.autoCheckin",
    descriptionKey: "settings:taskNotifications.taskDescriptions.autoCheckin",
    keywords: ["notification", "auto checkin", "check-in"],
  },
  {
    searchId: "control:task-notifications-webdav-auto-sync",
    targetId: "task-notifications-webdavAutoSync",
    labelKey: "settings:taskNotifications.tasks.webdavAutoSync",
    descriptionKey:
      "settings:taskNotifications.taskDescriptions.webdavAutoSync",
    keywords: ["notification", "webdav", "auto sync"],
  },
  {
    searchId: "control:task-notifications-managed-site-model-sync",
    targetId: "task-notifications-managedSiteModelSync",
    labelKey: "settings:taskNotifications.tasks.managedSiteModelSync",
    descriptionKey:
      "settings:taskNotifications.taskDescriptions.managedSiteModelSync",
    keywords: ["notification", "model sync", "managed site"],
  },
  {
    searchId: "control:task-notifications-usage-history-sync",
    targetId: "task-notifications-usageHistorySync",
    labelKey: "settings:taskNotifications.tasks.usageHistorySync",
    descriptionKey:
      "settings:taskNotifications.taskDescriptions.usageHistorySync",
    keywords: ["notification", "usage history", "sync"],
  },
  {
    searchId: "control:task-notifications-balance-history-capture",
    targetId: "task-notifications-balanceHistoryCapture",
    labelKey: "settings:taskNotifications.tasks.balanceHistoryCapture",
    descriptionKey:
      "settings:taskNotifications.taskDescriptions.balanceHistoryCapture",
    keywords: ["notification", "balance history", "capture"],
  },
  {
    searchId: "control:task-notifications-site-announcements",
    targetId: "task-notifications-site-announcements",
    labelKey: "settings:taskNotifications.siteAnnouncements.enable",
    descriptionKey: "settings:taskNotifications.siteAnnouncements.enableDesc",
    keywords: ["notification", "site announcement", "notice"],
  },
] as const

export const notificationsSearchSections: OptionsSearchItemDefinition[] = [
  buildSectionDefinition(
    "section:task-notifications",
    NOTIFICATIONS_TAB_ID,
    "task-notifications",
    "settings:taskNotifications.groups.setup.title",
    203,
    {
      descriptionKey: "settings:taskNotifications.groups.setup.description",
      keywords: ["notification", "scheduled task", "alarm"],
    },
  ),
  buildSectionDefinition(
    "section:task-notification-channels",
    NOTIFICATIONS_TAB_ID,
    "task-notification-channels",
    "settings:taskNotifications.groups.channels.title",
    204,
    {
      descriptionKey: "settings:taskNotifications.groups.channels.description",
      keywords: ["notification", "channel", "delivery", "telegram", "webhook"],
    },
  ),
  buildSectionDefinition(
    "section:task-notification-events",
    NOTIFICATIONS_TAB_ID,
    "task-notification-events",
    "settings:taskNotifications.groups.tasks.title",
    205,
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
    "task-notifications-enabled",
    "settings:taskNotifications.enable",
    507,
    {
      descriptionKey: "settings:taskNotifications.enableDesc",
      breadcrumbsKeys: TASK_NOTIFICATION_SETUP_BREADCRUMBS,
      keywords: ["notification", "scheduled task", "background task"],
    },
  ),
  buildControlDefinition(
    "control:task-notifications-channel-browser",
    NOTIFICATIONS_TAB_ID,
    "task-notifications-channel-browser",
    "settings:taskNotifications.channels.browser.title",
    508,
    {
      descriptionKey: "settings:taskNotifications.channels.browser.description",
      breadcrumbsKeys: TASK_NOTIFICATION_CHANNEL_BREADCRUMBS,
      keywords: ["notification", "browser", "system notification"],
    },
  ),
  buildControlDefinition(
    "control:task-notifications-permission",
    NOTIFICATIONS_TAB_ID,
    "task-notifications-permission",
    "settings:taskNotifications.permission.title",
    509,
    {
      descriptionKey: "settings:taskNotifications.permission.description",
      breadcrumbsKeys: TASK_NOTIFICATION_CHANNEL_BREADCRUMBS,
      keywords: ["notification", "permission", "system notification"],
    },
  ),
  buildControlDefinition(
    "control:task-notifications-channel-telegram",
    NOTIFICATIONS_TAB_ID,
    "task-notifications-channel-telegram",
    "settings:taskNotifications.channels.telegram.title",
    510,
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
    "task-notifications-channel-webhook",
    "settings:taskNotifications.channels.webhook.title",
    511,
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
