import {
  buildControlDefinition,
  buildSectionDefinition,
  DEFAULT_BREADCRUMBS,
} from "~/entrypoints/options/search/registryHelpers"
import type { OptionsSearchItemDefinition } from "~/entrypoints/options/search/types"

const TASK_NOTIFICATION_BREADCRUMBS = [
  ...DEFAULT_BREADCRUMBS,
  "settings:tabs.general",
  "settings:taskNotifications.title",
]

const SITE_ANNOUNCEMENT_BREADCRUMBS = [
  ...DEFAULT_BREADCRUMBS,
  "settings:tabs.general",
  "settings:siteAnnouncementNotifications.title",
]

const TASK_NOTIFICATION_CONTROL_ORDER_START = 509

const TASK_NOTIFICATION_SEARCH_CONTROLS = [
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

export const generalSearchSections: OptionsSearchItemDefinition[] = [
  buildSectionDefinition(
    "section:display",
    "general",
    "general-display",
    "settings:display.title",
    200,
  ),
  buildSectionDefinition(
    "section:appearance",
    "general",
    "appearance",
    "settings:theme.appearance",
    201,
  ),
  buildSectionDefinition(
    "section:action-click",
    "general",
    "action-click",
    "settings:actionClick.title",
    202,
  ),
  buildSectionDefinition(
    "section:task-notifications",
    "general",
    "task-notifications",
    "settings:taskNotifications.title",
    203,
    {
      descriptionKey: "settings:taskNotifications.description",
      keywords: ["notification", "scheduled task", "alarm"],
    },
  ),
  buildSectionDefinition(
    "section:site-announcements",
    "general",
    "site-announcement-notifications",
    "settings:siteAnnouncementNotifications.title",
    204,
    {
      descriptionKey: "settings:siteAnnouncementNotifications.description",
      keywords: ["announcement", "notice", "polling"],
    },
  ),
  buildSectionDefinition(
    "section:changelog",
    "general",
    "changelog-on-update",
    "settings:changelogOnUpdate.title",
    205,
  ),
  buildSectionDefinition(
    "section:logging",
    "general",
    "logging",
    "settings:logging.title",
    206,
  ),
  buildSectionDefinition(
    "section:danger",
    "general",
    "dangerous-zone",
    "settings:danger.title",
    207,
  ),
]

export const generalSearchControls: OptionsSearchItemDefinition[] = [
  buildControlDefinition(
    "control:display-currency",
    "general",
    "display-currency-unit",
    "settings:display.currencyUnit",
    500,
    {
      descriptionKey: "settings:display.currencyDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.general",
        "settings:display.title",
      ],
      keywords: ["currency", "usd", "cny", "money"],
    },
  ),
  buildControlDefinition(
    "control:display-today-cashflow",
    "general",
    "display-today-cashflow-enabled",
    "settings:display.todayCashflowEnabled",
    501,
    {
      descriptionKey: "settings:display.todayCashflowEnabledDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.general",
        "settings:display.title",
      ],
      keywords: ["cashflow", "today", "income", "consumption"],
    },
  ),
  buildControlDefinition(
    "control:display-default-tab",
    "general",
    "display-default-tab",
    "settings:display.defaultTab",
    502,
    {
      descriptionKey: "settings:display.defaultTabDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.general",
        "settings:display.title",
      ],
      keywords: ["default", "dashboard", "total balance", "today cashflow"],
      isVisible: (context) => context.showTodayCashflow,
    },
  ),
  buildControlDefinition(
    "control:appearance-theme-mode",
    "general",
    "appearance-theme-mode",
    "settings:theme.appearance",
    503,
    {
      descriptionKey: "settings:theme.selectTheme",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.general",
        "settings:theme.appearance",
      ],
      keywords: ["theme", "light", "dark", "system"],
    },
  ),
  buildControlDefinition(
    "control:appearance-language",
    "general",
    "appearance-language",
    "settings:appearanceLanguage.language",
    504,
    {
      descriptionKey: "settings:appearanceLanguage.languageDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.general",
        "settings:theme.appearance",
      ],
      keywords: ["language", "locale", "i18n"],
    },
  ),
  buildControlDefinition(
    "control:action-click",
    "general",
    "action-click-behavior",
    "settings:actionClick.actionIconClickTitle",
    505,
    {
      descriptionKey: "settings:actionClick.description",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.general",
        "settings:actionClick.title",
      ],
      keywords: ["popup", "sidepanel", "toolbar", "icon"],
    },
  ),
  buildControlDefinition(
    "control:action-click-sidepanel",
    "general",
    "action-click-behavior",
    "settings:actionClick.sidepanelTitle",
    506,
    {
      descriptionKey: "settings:actionClick.sidepanelUnsupportedHelper",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.general",
        "settings:actionClick.title",
      ],
      keywords: ["sidepanel", "sidebar", "toolbar"],
      isVisible: (context) => context.sidePanelSupported,
    },
  ),
  buildControlDefinition(
    "control:task-notifications-enabled",
    "general",
    "task-notifications-enabled",
    "settings:taskNotifications.enable",
    507,
    {
      descriptionKey: "settings:taskNotifications.enableDesc",
      breadcrumbsKeys: TASK_NOTIFICATION_BREADCRUMBS,
      keywords: ["notification", "scheduled task", "background task"],
    },
  ),
  buildControlDefinition(
    "control:task-notifications-permission",
    "general",
    "task-notifications-permission",
    "settings:taskNotifications.permission.title",
    508,
    {
      descriptionKey: "settings:taskNotifications.permission.description",
      breadcrumbsKeys: TASK_NOTIFICATION_BREADCRUMBS,
      keywords: ["notification", "permission", "system notification"],
    },
  ),
  ...TASK_NOTIFICATION_SEARCH_CONTROLS.map((definition, index) =>
    buildControlDefinition(
      definition.searchId,
      "general",
      definition.targetId,
      definition.labelKey,
      TASK_NOTIFICATION_CONTROL_ORDER_START + index,
      {
        descriptionKey: definition.descriptionKey,
        breadcrumbsKeys: TASK_NOTIFICATION_BREADCRUMBS,
        keywords: [...definition.keywords],
      },
    ),
  ),
  buildControlDefinition(
    "control:site-announcements-polling",
    "general",
    "site-announcement-notifications-enabled",
    "settings:siteAnnouncementNotifications.polling.enable",
    515,
    {
      descriptionKey:
        "settings:siteAnnouncementNotifications.polling.enableDesc",
      breadcrumbsKeys: SITE_ANNOUNCEMENT_BREADCRUMBS,
      keywords: ["announcement", "notice", "polling", "background check"],
    },
  ),
  buildControlDefinition(
    "control:site-announcements-page",
    "general",
    "site-announcement-notifications-page",
    "settings:siteAnnouncementNotifications.page.title",
    516,
    {
      descriptionKey: "settings:siteAnnouncementNotifications.page.description",
      breadcrumbsKeys: SITE_ANNOUNCEMENT_BREADCRUMBS,
      keywords: ["announcement", "notice", "records", "page"],
    },
  ),
  buildControlDefinition(
    "control:changelog-on-update",
    "general",
    "changelog-on-update-toggle",
    "settings:changelogOnUpdate.toggleLabel",
    517,
    {
      descriptionKey: "settings:changelogOnUpdate.toggleDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.general",
        "settings:changelogOnUpdate.title",
      ],
      keywords: ["changelog", "what's new", "update log"],
    },
  ),
  buildControlDefinition(
    "control:logging-enabled",
    "general",
    "logging-console-enabled",
    "settings:logging.consoleEnabled",
    518,
    {
      descriptionKey: "settings:logging.consoleEnabledDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.general",
        "settings:logging.title",
      ],
      keywords: ["log", "console", "debug"],
    },
  ),
  buildControlDefinition(
    "control:logging-min-level",
    "general",
    "logging-min-level",
    "settings:logging.minLevel",
    519,
    {
      descriptionKey: "settings:logging.minLevelDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.general",
        "settings:logging.title",
      ],
      keywords: ["log", "debug", "warn", "error", "info"],
    },
  ),
  buildControlDefinition(
    "control:danger-reset-settings",
    "general",
    "danger-reset-settings",
    "settings:danger.resetSettings",
    520,
    {
      descriptionKey: "settings:danger.resetDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.general",
        "settings:danger.title",
      ],
      keywords: ["danger", "reset", "reset settings", "defaults"],
    },
  ),
]
