import { SITE_TYPES } from "~/constants/siteType"
import {
  buildControlDefinition,
  buildSectionDefinition,
  DEFAULT_BREADCRUMBS,
} from "~/features/OptionsSearch/registryHelpers"
import type { OptionsSearchItemDefinition } from "~/features/OptionsSearch/types"

import { defineManagedSiteSettingsSearch } from "./defineManagedSiteSettingsSearch"

const sections: OptionsSearchItemDefinition[] = [
  buildSectionDefinition(
    "section:veloera",
    "managedSite",
    "veloera",
    "settings:veloera.title",
    343,
    {
      keywordKeys: ["common:actions.reset"],
      keywords: ["veloera"],
    },
  ),
]

const controls: OptionsSearchItemDefinition[] = [
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
    },
  ),
  buildControlDefinition(
    "control:veloera-admin-credentials-link",
    "managedSite",
    "veloera-base-url",
    "settings:veloera.adminCredentialsLink.title",
    660,
    {
      descriptionKey: "settings:veloera.adminCredentialsLink.description",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.managedSite",
        "settings:veloera.title",
      ],
      keywords: ["veloera", "admin credentials", "base url"],
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
    },
  ),
]

export const veloeraSettingsSearch = defineManagedSiteSettingsSearch(
  SITE_TYPES.VELOERA,
  sections,
  controls,
)
