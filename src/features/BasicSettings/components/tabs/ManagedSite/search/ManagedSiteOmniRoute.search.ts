import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { SITE_TYPES } from "~/constants/siteType"
import { defineManagedSiteSettingsSearch } from "~/features/BasicSettings/components/tabs/ManagedSite/search/defineManagedSiteSettingsSearch"
import {
  buildControlDefinition,
  buildSectionDefinition,
  DEFAULT_BREADCRUMBS,
} from "~/features/OptionsSearch/registryHelpers"
import type { OptionsSearchItemDefinition } from "~/features/OptionsSearch/types"

const breadcrumbs = [
  ...DEFAULT_BREADCRUMBS,
  "settings:tabs.managedSite",
  "settings:omniroute.title",
]

const sections: OptionsSearchItemDefinition[] = [
  buildSectionDefinition(
    "section:omniroute",
    "managedSite",
    SETTINGS_ANCHORS.OMNIROUTE,
    "settings:omniroute.title",
    349,
    {
      keywordKeys: ["common:actions.reset"],
      keywords: ["omniroute", "9router", "self-hosted gateway"],
    },
  ),
]

const controls: OptionsSearchItemDefinition[] = [
  buildControlDefinition(
    "control:omniroute-base-url",
    "managedSite",
    SETTINGS_ANCHORS.OMNIROUTE_BASE_URL,
    "settings:omniroute.fields.baseUrlLabel",
    685,
    {
      descriptionKey: "settings:omniroute.fields.baseUrlDesc",
      breadcrumbsKeys: breadcrumbs,
      keywords: ["omniroute", "base url", "dashboard"],
    },
  ),
  buildControlDefinition(
    "control:omniroute-credential",
    "managedSite",
    SETTINGS_ANCHORS.OMNIROUTE_CREDENTIAL,
    "settings:omniroute.fields.credentialLabel",
    686,
    {
      descriptionKey: "settings:omniroute.fields.credentialDesc",
      breadcrumbsKeys: breadcrumbs,
      keywords: ["omniroute", "access token", "oma", "访问令牌"],
    },
  ),
  buildControlDefinition(
    "control:omniroute-access-tokens-link",
    "managedSite",
    SETTINGS_ANCHORS.OMNIROUTE_TOKENS_LINK,
    "settings:omniroute.accessTokens.title",
    687,
    {
      descriptionKey: "settings:omniroute.accessTokens.description",
      breadcrumbsKeys: breadcrumbs,
      keywords: [
        "omniroute",
        "access tokens",
        "api manager",
        "revoke",
        "撤销令牌",
      ],
    },
  ),
  buildControlDefinition(
    "control:omniroute-validate",
    "managedSite",
    SETTINGS_ANCHORS.OMNIROUTE_VALIDATE,
    "settings:omniroute.validation.title",
    688,
    {
      descriptionKey: "settings:omniroute.validation.description",
      breadcrumbsKeys: breadcrumbs,
      keywords: ["omniroute", "validate", "connection"],
    },
  ),
]

export const omniRouteSettingsSearch = defineManagedSiteSettingsSearch(
  SITE_TYPES.OMNIROUTE,
  sections,
  controls,
)
