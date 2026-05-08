import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import {
  buildControlDefinition,
  buildSectionDefinition,
  DEFAULT_BREADCRUMBS,
} from "~/entrypoints/options/search/registryHelpers"
import type { OptionsSearchItemDefinition } from "~/entrypoints/options/search/types"

const SITE_ANNOUNCEMENT_BREADCRUMBS = [
  ...DEFAULT_BREADCRUMBS,
  "settings:tabs.general",
  "settings:siteAnnouncementNotifications.title",
]

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
    "section:site-announcements",
    "general",
    SETTINGS_ANCHORS.SITE_ANNOUNCEMENT_NOTIFICATIONS,
    "settings:siteAnnouncementNotifications.title",
    203,
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
    204,
  ),
  buildSectionDefinition(
    "section:logging",
    "general",
    "logging",
    "settings:logging.title",
    205,
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
    "control:site-announcements-polling",
    "general",
    SETTINGS_ANCHORS.SITE_ANNOUNCEMENT_NOTIFICATIONS_ENABLED,
    "settings:siteAnnouncementNotifications.polling.enable",
    507,
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
    SETTINGS_ANCHORS.SITE_ANNOUNCEMENT_NOTIFICATIONS_PAGE,
    "settings:siteAnnouncementNotifications.page.title",
    508,
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
    "control:logging-enabled",
    "general",
    "logging-console-enabled",
    "settings:logging.consoleEnabled",
    510,
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
    511,
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
    512,
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
