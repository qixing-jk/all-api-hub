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
  "settings:magpie.title",
]

const sections: OptionsSearchItemDefinition[] = [
  buildSectionDefinition(
    "section:magpie",
    "managedSite",
    SETTINGS_ANCHORS.MAGPIE,
    "settings:magpie.title",
    358,
    {
      keywordKeys: ["common:actions.reset"],
      keywords: ["magpie", "self-hosted gateway", "供应商"],
    },
  ),
]

const controls: OptionsSearchItemDefinition[] = [
  buildControlDefinition(
    "control:magpie-base-url",
    "managedSite",
    SETTINGS_ANCHORS.MAGPIE_BASE_URL,
    "settings:magpie.fields.baseUrlLabel",
    700,
    {
      descriptionKey: "settings:magpie.fields.baseUrlDesc",
      breadcrumbsKeys: breadcrumbs,
      keywords: ["magpie", "base url", "dashboard", "地址"],
    },
  ),
  buildControlDefinition(
    "control:magpie-web-key",
    "managedSite",
    SETTINGS_ANCHORS.MAGPIE_WEB_KEY,
    "settings:magpie.fields.webKeyLabel",
    702,
    {
      descriptionKey: "settings:magpie.fields.webKeyDesc",
      breadcrumbsKeys: breadcrumbs,
      keywords: ["magpie", "web key", "MAGPIE_WEB_KEY", "管理密钥"],
    },
  ),
  buildControlDefinition(
    "control:magpie-validate",
    "managedSite",
    SETTINGS_ANCHORS.MAGPIE_VALIDATE,
    "settings:magpie.validation.title",
    706,
    {
      descriptionKey: "settings:magpie.validation.description",
      breadcrumbsKeys: breadcrumbs,
      keywords: ["magpie", "validate", "connection", "验证"],
    },
  ),
]

export const magpieSettingsSearch = defineManagedSiteSettingsSearch(
  SITE_TYPES.MAGPIE,
  sections,
  controls,
)
