import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import {
  buildControlDefinition,
  buildSectionDefinition,
  DEFAULT_BREADCRUMBS,
} from "~/features/OptionsSearch/registryHelpers"
import type { OptionsSearchItemDefinition } from "~/features/OptionsSearch/types"

const SITE_ANNOUNCEMENTS_TAB_ID = "siteAnnouncements"

const SITE_ANNOUNCEMENTS_TAB_BREADCRUMBS = [
  ...DEFAULT_BREADCRUMBS,
  "settings:tabs.siteAnnouncements",
]

const SITE_ANNOUNCEMENT_SETTINGS_BREADCRUMBS = [
  ...SITE_ANNOUNCEMENTS_TAB_BREADCRUMBS,
  "settings:siteAnnouncementNotifications.title",
]

export const siteAnnouncementsSearchSections: OptionsSearchItemDefinition[] = [
  buildSectionDefinition(
    "section:site-announcements",
    SITE_ANNOUNCEMENTS_TAB_ID,
    SETTINGS_ANCHORS.SITE_ANNOUNCEMENT_NOTIFICATIONS,
    "settings:siteAnnouncementNotifications.title",
    310,
    {
      keywordKeys: ["common:actions.reset"],
      descriptionKey: "settings:siteAnnouncementNotifications.description",
      keywords: ["announcement", "notice", "polling"],
    },
  ),
]

export const siteAnnouncementsSearchControls: OptionsSearchItemDefinition[] = [
  buildControlDefinition(
    "control:site-announcements-polling",
    SITE_ANNOUNCEMENTS_TAB_ID,
    SETTINGS_ANCHORS.SITE_ANNOUNCEMENT_NOTIFICATIONS_ENABLED,
    "settings:siteAnnouncementNotifications.polling.enable",
    616,
    {
      descriptionKey:
        "settings:siteAnnouncementNotifications.polling.enableDesc",
      breadcrumbsKeys: SITE_ANNOUNCEMENT_SETTINGS_BREADCRUMBS,
      keywords: ["announcement", "notice", "polling", "background check"],
    },
  ),
  buildControlDefinition(
    "control:site-announcements-interval",
    SITE_ANNOUNCEMENTS_TAB_ID,
    SETTINGS_ANCHORS.SITE_ANNOUNCEMENT_NOTIFICATIONS_INTERVAL,
    "settings:siteAnnouncementNotifications.polling.interval",
    617,
    {
      descriptionKey:
        "settings:siteAnnouncementNotifications.polling.intervalDesc",
      breadcrumbsKeys: SITE_ANNOUNCEMENT_SETTINGS_BREADCRUMBS,
      keywords: [
        "announcement",
        "notice",
        "polling interval",
        "background check interval",
        "minutes",
      ],
    },
  ),
  buildControlDefinition(
    "control:site-announcements-max-age",
    SITE_ANNOUNCEMENTS_TAB_ID,
    SETTINGS_ANCHORS.SITE_ANNOUNCEMENT_NOTIFICATIONS_MAX_AGE,
    "settings:siteAnnouncementNotifications.polling.maxAge",
    618,
    {
      descriptionKey:
        "settings:siteAnnouncementNotifications.polling.maxAgeDesc",
      breadcrumbsKeys: SITE_ANNOUNCEMENT_SETTINGS_BREADCRUMBS,
      keywords: ["announcement", "notice", "history", "days", "age"],
    },
  ),
  buildControlDefinition(
    "control:site-announcements-page",
    SITE_ANNOUNCEMENTS_TAB_ID,
    SETTINGS_ANCHORS.SITE_ANNOUNCEMENT_NOTIFICATIONS_PAGE,
    "settings:siteAnnouncementNotifications.page.title",
    619,
    {
      descriptionKey: "settings:siteAnnouncementNotifications.page.description",
      breadcrumbsKeys: SITE_ANNOUNCEMENT_SETTINGS_BREADCRUMBS,
      keywords: ["announcement", "notice", "records", "page"],
    },
  ),
]
