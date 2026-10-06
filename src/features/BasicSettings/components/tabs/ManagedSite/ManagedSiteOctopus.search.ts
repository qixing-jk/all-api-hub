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
    "section:octopus",
    "managedSite",
    "octopus",
    "settings:octopus.title",
    344,
    {
      keywordKeys: ["common:actions.reset"],
      keywords: ["octopus"],
    },
  ),
]

const controls: OptionsSearchItemDefinition[] = [
  buildControlDefinition(
    "control:octopus-base-url",
    "managedSite",
    "octopus-base-url",
    "settings:octopus.fields.baseUrlLabel",
    667,
    {
      descriptionKey: "settings:octopus.fields.baseUrlDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.managedSite",
        "settings:octopus.title",
      ],
      keywords: ["octopus", "base url"],
    },
  ),
  buildControlDefinition(
    "control:octopus-username",
    "managedSite",
    "octopus-username",
    "settings:octopus.fields.usernameLabel",
    668,
    {
      descriptionKey: "settings:octopus.fields.usernameDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.managedSite",
        "settings:octopus.title",
      ],
      keywords: ["octopus", "username"],
    },
  ),
  buildControlDefinition(
    "control:octopus-password",
    "managedSite",
    "octopus-password",
    "settings:octopus.fields.passwordLabel",
    669,
    {
      descriptionKey: "settings:octopus.fields.passwordDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.managedSite",
        "settings:octopus.title",
      ],
      keywords: ["octopus", "password"],
    },
  ),
  buildControlDefinition(
    "control:octopus-validate-config",
    "managedSite",
    "octopus-validate-config",
    "settings:octopus.validation.title",
    670,
    {
      descriptionKey: "settings:octopus.validation.description",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.managedSite",
        "settings:octopus.title",
      ],
      keywords: ["octopus", "validate", "login"],
    },
  ),
]

export const octopusSettingsSearch = defineManagedSiteSettingsSearch(
  SITE_TYPES.OCTOPUS,
  sections,
  controls,
)
