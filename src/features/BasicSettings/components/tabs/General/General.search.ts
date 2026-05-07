import {
  buildControlDefinition,
  buildSectionDefinition,
  DEFAULT_BREADCRUMBS,
} from "~/entrypoints/options/search/registryHelpers"
import type { OptionsSearchItemDefinition } from "~/entrypoints/options/search/types"

export const generalSearchSections: OptionsSearchItemDefinition[] = [
  buildSectionDefinition(
    "section:display",
    "general",
    "general-display",
    "settings:display.title",
    200,
  ),
  buildSectionDefinition(
    "section:action-click",
    "general",
    "action-click",
    "settings:actionClick.title",
    201,
  ),
  buildSectionDefinition(
    "section:logging",
    "general",
    "logging",
    "settings:logging.title",
    202,
  ),
  buildSectionDefinition(
    "section:changelog",
    "general",
    "changelog-on-update",
    "settings:changelogOnUpdate.title",
    203,
  ),
  buildSectionDefinition(
    "section:appearance",
    "general",
    "appearance",
    "settings:theme.appearance",
    204,
    {
      descriptionKey: "settings:display.description",
    },
  ),
  buildSectionDefinition(
    "section:task-notifications",
    "general",
    "task-notifications",
    "settings:taskNotifications.title",
    205,
    {
      descriptionKey: "settings:taskNotifications.description",
      keywords: ["notification", "scheduled task", "alarm"],
    },
  ),
  buildSectionDefinition(
    "section:danger",
    "general",
    "dangerous-zone",
    "settings:danger.title",
    206,
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
    "control:logging-enabled",
    "general",
    "logging-console-enabled",
    "settings:logging.consoleEnabled",
    507,
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
    508,
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
    "control:changelog-on-update",
    "general",
    "changelog-on-update-toggle",
    "settings:changelogOnUpdate.toggleLabel",
    509,
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
    "control:danger-reset-settings",
    "general",
    "danger-reset-settings",
    "settings:danger.resetSettings",
    510,
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
  buildControlDefinition(
    "control:task-notifications-enabled",
    "general",
    "task-notifications-enabled",
    "settings:taskNotifications.enable",
    511,
    {
      descriptionKey: "settings:taskNotifications.enableDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.general",
        "settings:taskNotifications.title",
      ],
      keywords: ["notification", "scheduled task", "background task"],
    },
  ),
  buildControlDefinition(
    "control:task-notifications-permission",
    "general",
    "task-notifications-permission",
    "settings:taskNotifications.permission.title",
    512,
    {
      descriptionKey: "settings:taskNotifications.permission.description",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.general",
        "settings:taskNotifications.title",
      ],
      keywords: ["notification", "permission", "system notification"],
    },
  ),
  buildControlDefinition(
    "control:task-notifications-auto-checkin",
    "general",
    "task-notifications-autoCheckin",
    "settings:taskNotifications.tasks.autoCheckin",
    513,
    {
      descriptionKey: "settings:taskNotifications.taskDescriptions.autoCheckin",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.general",
        "settings:taskNotifications.title",
      ],
      keywords: ["notification", "auto checkin", "check-in"],
    },
  ),
  buildControlDefinition(
    "control:task-notifications-webdav-auto-sync",
    "general",
    "task-notifications-webdavAutoSync",
    "settings:taskNotifications.tasks.webdavAutoSync",
    514,
    {
      descriptionKey:
        "settings:taskNotifications.taskDescriptions.webdavAutoSync",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.general",
        "settings:taskNotifications.title",
      ],
      keywords: ["notification", "webdav", "auto sync"],
    },
  ),
  buildControlDefinition(
    "control:task-notifications-managed-site-model-sync",
    "general",
    "task-notifications-managedSiteModelSync",
    "settings:taskNotifications.tasks.managedSiteModelSync",
    515,
    {
      descriptionKey:
        "settings:taskNotifications.taskDescriptions.managedSiteModelSync",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.general",
        "settings:taskNotifications.title",
      ],
      keywords: ["notification", "model sync", "managed site"],
    },
  ),
  buildControlDefinition(
    "control:task-notifications-usage-history-sync",
    "general",
    "task-notifications-usageHistorySync",
    "settings:taskNotifications.tasks.usageHistorySync",
    516,
    {
      descriptionKey:
        "settings:taskNotifications.taskDescriptions.usageHistorySync",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.general",
        "settings:taskNotifications.title",
      ],
      keywords: ["notification", "usage history", "sync"],
    },
  ),
  buildControlDefinition(
    "control:task-notifications-balance-history-capture",
    "general",
    "task-notifications-balanceHistoryCapture",
    "settings:taskNotifications.tasks.balanceHistoryCapture",
    517,
    {
      descriptionKey:
        "settings:taskNotifications.taskDescriptions.balanceHistoryCapture",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.general",
        "settings:taskNotifications.title",
      ],
      keywords: ["notification", "balance history", "capture"],
    },
  ),
]
