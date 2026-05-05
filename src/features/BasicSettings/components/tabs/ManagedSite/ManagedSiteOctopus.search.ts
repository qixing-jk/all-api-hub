import { OCTOPUS } from "~/constants/siteType"
import {
  buildControlDefinition,
  buildSectionDefinition,
  DEFAULT_BREADCRUMBS,
} from "~/entrypoints/options/search/registryHelpers"
import type { OptionsSearchItemDefinition } from "~/entrypoints/options/search/types"

export const managedSiteOctopusSearchSections: OptionsSearchItemDefinition[] = [
  buildSectionDefinition(
    "section:octopus",
    "managedSite",
    "octopus",
    "settings:octopus.title",
    344,
    {
      keywords: ["octopus"],
      isVisible: (context) => context.managedSiteType === OCTOPUS,
    },
  ),
]

export const managedSiteOctopusSearchControls: OptionsSearchItemDefinition[] = [
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
      isVisible: (context) => context.managedSiteType === OCTOPUS,
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
      isVisible: (context) => context.managedSiteType === OCTOPUS,
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
      isVisible: (context) => context.managedSiteType === OCTOPUS,
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
      isVisible: (context) => context.managedSiteType === OCTOPUS,
    },
  ),
]
