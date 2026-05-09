import { SITE_TYPES } from "~/constants/siteType"
import {
  buildControlDefinition,
  buildSectionDefinition,
  DEFAULT_BREADCRUMBS,
} from "~/entrypoints/options/search/registryHelpers"
import type { OptionsSearchItemDefinition } from "~/entrypoints/options/search/types"

export const managedSiteVeloeraSearchSections: OptionsSearchItemDefinition[] = [
  buildSectionDefinition(
    "section:veloera",
    "managedSite",
    "veloera",
    "settings:veloera.title",
    343,
    {
      keywords: ["veloera"],
      isVisible: (context) => context.managedSiteType === SITE_TYPES.VELOERA,
    },
  ),
]

export const managedSiteVeloeraSearchControls: OptionsSearchItemDefinition[] = [
  buildControlDefinition(
    "control:veloera-base-url",
    "managedSite",
    "veloera-base-url",
    "settings:veloera.fields.baseUrlLabel",
    659,
    {
      descriptionKey: "settings:veloera.urlDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.managedSite",
        "settings:veloera.title",
      ],
      keywords: ["veloera", "base url"],
      isVisible: (context) => context.managedSiteType === SITE_TYPES.VELOERA,
    },
  ),
  buildControlDefinition(
    "control:veloera-admin-credentials-link",
    "managedSite",
    "veloera-admin-credentials-link",
    "settings:veloera.adminCredentialsLink.title",
    660,
    {
      descriptionKey: "settings:veloera.adminCredentialsLink.description",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.managedSite",
        "settings:veloera.title",
      ],
      keywords: ["veloera", "admin credentials"],
      isVisible: (context) => context.managedSiteType === SITE_TYPES.VELOERA,
    },
  ),
  buildControlDefinition(
    "control:veloera-admin-token",
    "managedSite",
    "veloera-admin-token",
    "settings:veloera.fields.adminTokenLabel",
    661,
    {
      descriptionKey: "settings:veloera.tokenDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.managedSite",
        "settings:veloera.title",
      ],
      keywords: ["veloera", "token"],
      isVisible: (context) => context.managedSiteType === SITE_TYPES.VELOERA,
    },
  ),
  buildControlDefinition(
    "control:veloera-user-id",
    "managedSite",
    "veloera-user-id",
    "settings:veloera.fields.userIdLabel",
    662,
    {
      descriptionKey: "settings:veloera.userIdDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.managedSite",
        "settings:veloera.title",
      ],
      keywords: ["veloera", "user id"],
      isVisible: (context) => context.managedSiteType === SITE_TYPES.VELOERA,
    },
  ),
]
