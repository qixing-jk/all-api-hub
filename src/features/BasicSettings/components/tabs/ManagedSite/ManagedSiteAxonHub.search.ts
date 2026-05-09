import { SITE_TYPES } from "~/constants/siteType"
import {
  buildControlDefinition,
  buildSectionDefinition,
  DEFAULT_BREADCRUMBS,
} from "~/entrypoints/options/search/registryHelpers"
import type { OptionsSearchItemDefinition } from "~/entrypoints/options/search/types"

export const managedSiteAxonHubSearchSections: OptionsSearchItemDefinition[] = [
  buildSectionDefinition(
    "section:axonhub",
    "managedSite",
    "axonhub",
    "settings:axonHub.title",
    345,
    {
      keywords: ["axonhub", "graphql"],
      isVisible: (context) => context.managedSiteType === SITE_TYPES.AXON_HUB,
    },
  ),
]

export const managedSiteAxonHubSearchControls: OptionsSearchItemDefinition[] = [
  buildControlDefinition(
    "control:axonhub-base-url",
    "managedSite",
    "axonhub-base-url",
    "settings:axonHub.fields.baseUrlLabel",
    671,
    {
      descriptionKey: "settings:axonHub.fields.baseUrlDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.managedSite",
        "settings:axonHub.title",
      ],
      keywords: ["axonhub", "base url"],
      isVisible: (context) => context.managedSiteType === SITE_TYPES.AXON_HUB,
    },
  ),
  buildControlDefinition(
    "control:axonhub-email",
    "managedSite",
    "axonhub-email",
    "settings:axonHub.fields.emailLabel",
    672,
    {
      descriptionKey: "settings:axonHub.fields.emailDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.managedSite",
        "settings:axonHub.title",
      ],
      keywords: ["axonhub", "email"],
      isVisible: (context) => context.managedSiteType === SITE_TYPES.AXON_HUB,
    },
  ),
  buildControlDefinition(
    "control:axonhub-password",
    "managedSite",
    "axonhub-password",
    "settings:axonHub.fields.passwordLabel",
    673,
    {
      descriptionKey: "settings:axonHub.fields.passwordDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.managedSite",
        "settings:axonHub.title",
      ],
      keywords: ["axonhub", "password"],
      isVisible: (context) => context.managedSiteType === SITE_TYPES.AXON_HUB,
    },
  ),
  buildControlDefinition(
    "control:axonhub-validate-config",
    "managedSite",
    "axonhub-validate-config",
    "settings:axonHub.validation.title",
    674,
    {
      descriptionKey: "settings:axonHub.validation.description",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.managedSite",
        "settings:axonHub.title",
      ],
      keywords: ["axonhub", "validate", "signin"],
      isVisible: (context) => context.managedSiteType === SITE_TYPES.AXON_HUB,
    },
  ),
  buildControlDefinition(
    "control:axonhub-cors-note",
    "managedSite",
    "axonhub-cors-note",
    "settings:axonHub.cors.title",
    675,
    {
      descriptionKey: "settings:axonHub.cors.description",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.managedSite",
        "settings:axonHub.title",
      ],
      keywords: ["axonhub", "cors", "forbidden"],
      isVisible: (context) => context.managedSiteType === SITE_TYPES.AXON_HUB,
    },
  ),
]
