import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
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
    "section:axonhub",
    "managedSite",
    SETTINGS_ANCHORS.AXON_HUB,
    "settings:axonHub.title",
    345,
    {
      keywordKeys: ["common:actions.reset"],
      keywords: ["axonhub", "graphql"],
    },
  ),
]

const controls: OptionsSearchItemDefinition[] = [
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
    },
  ),
]

export const axonHubSettingsSearch = defineManagedSiteSettingsSearch(
  SITE_TYPES.AXON_HUB,
  sections,
  controls,
)
