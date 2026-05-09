import { SITE_TYPES } from "~/constants/siteType"
import {
  buildControlDefinition,
  buildSectionDefinition,
  DEFAULT_BREADCRUMBS,
} from "~/entrypoints/options/search/registryHelpers"
import type { OptionsSearchItemDefinition } from "~/entrypoints/options/search/types"

export const managedSiteDoneHubSearchSections: OptionsSearchItemDefinition[] = [
  buildSectionDefinition(
    "section:done-hub",
    "managedSite",
    "done-hub",
    "settings:doneHub.title",
    342,
    {
      keywords: ["done-hub", "donehub"],
      isVisible: (context) => context.managedSiteType === SITE_TYPES.DONE_HUB,
    },
  ),
]

export const managedSiteDoneHubSearchControls: OptionsSearchItemDefinition[] = [
  buildControlDefinition(
    "control:done-hub-base-url",
    "managedSite",
    "done-hub-base-url",
    "settings:doneHub.fields.baseUrlLabel",
    663,
    {
      descriptionKey: "settings:doneHub.urlDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.managedSite",
        "settings:doneHub.title",
      ],
      keywords: ["done-hub", "donehub", "base url"],
      isVisible: (context) => context.managedSiteType === SITE_TYPES.DONE_HUB,
    },
  ),
  buildControlDefinition(
    "control:done-hub-admin-credentials-link",
    "managedSite",
    "done-hub-admin-credentials-link",
    "settings:doneHub.adminCredentialsLink.title",
    664,
    {
      descriptionKey: "settings:doneHub.adminCredentialsLink.description",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.managedSite",
        "settings:doneHub.title",
      ],
      keywords: ["done-hub", "donehub", "admin credentials"],
      isVisible: (context) => context.managedSiteType === SITE_TYPES.DONE_HUB,
    },
  ),
  buildControlDefinition(
    "control:done-hub-admin-token",
    "managedSite",
    "done-hub-admin-token",
    "settings:doneHub.fields.adminTokenLabel",
    665,
    {
      descriptionKey: "settings:doneHub.tokenDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.managedSite",
        "settings:doneHub.title",
      ],
      keywords: ["done-hub", "donehub", "token"],
      isVisible: (context) => context.managedSiteType === SITE_TYPES.DONE_HUB,
    },
  ),
  buildControlDefinition(
    "control:done-hub-user-id",
    "managedSite",
    "done-hub-user-id",
    "settings:doneHub.fields.userIdLabel",
    666,
    {
      descriptionKey: "settings:doneHub.userIdDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.managedSite",
        "settings:doneHub.title",
      ],
      keywords: ["done-hub", "donehub", "user id"],
      isVisible: (context) => context.managedSiteType === SITE_TYPES.DONE_HUB,
    },
  ),
]
