import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { SITE_TYPES } from "~/constants/siteType"
import {
  buildControlDefinition,
  buildSectionDefinition,
  DEFAULT_BREADCRUMBS,
} from "~/features/OptionsSearch/registryHelpers"
import type { OptionsSearchItemDefinition } from "~/features/OptionsSearch/types"

import { defineManagedSiteSettingsSearch } from "./defineManagedSiteSettingsSearch"

const breadcrumbs = [
  ...DEFAULT_BREADCRUMBS,
  "settings:tabs.managedSite",
  "settings:sub2apiManagedSite.title",
]

const sections: OptionsSearchItemDefinition[] = [
  buildSectionDefinition(
    "section:sub2api-managed-site",
    "managedSite",
    SETTINGS_ANCHORS.SUB2API,
    "settings:sub2apiManagedSite.title",
    347,
    {
      keywordKeys: ["common:actions.reset"],
      keywords: ["sub2api", "admin api key"],
    },
  ),
]

const controls: OptionsSearchItemDefinition[] = [
  buildControlDefinition(
    "control:sub2api-managed-site-base-url",
    "managedSite",
    SETTINGS_ANCHORS.SUB2API_BASE_URL,
    "settings:sub2apiManagedSite.fields.baseUrlLabel",
    680,
    {
      descriptionKey: "settings:sub2apiManagedSite.fields.baseUrlDesc",
      breadcrumbsKeys: breadcrumbs,
      keywords: ["sub2api", "base url"],
    },
  ),
  buildControlDefinition(
    "control:sub2api-managed-site-admin-credentials-link",
    "managedSite",
    SETTINGS_ANCHORS.SUB2API_ADMIN_CREDENTIALS_LINK,
    "settings:sub2apiManagedSite.adminCredentialsLink.title",
    681,
    {
      descriptionKey:
        "settings:sub2apiManagedSite.adminCredentialsLink.description",
      breadcrumbsKeys: breadcrumbs,
      keywords: [
        "sub2api",
        "admin api key",
        "get key",
        "security",
        "管理key",
        "获取密钥",
      ],
    },
  ),
  buildControlDefinition(
    "control:sub2api-managed-site-admin-api-key",
    "managedSite",
    SETTINGS_ANCHORS.SUB2API_ADMIN_API_KEY,
    "settings:sub2apiManagedSite.fields.adminApiKeyLabel",
    682,
    {
      descriptionKey: "settings:sub2apiManagedSite.fields.adminApiKeyDesc",
      breadcrumbsKeys: breadcrumbs,
      keywords: ["sub2api", "admin api key", "x-api-key"],
    },
  ),
  buildControlDefinition(
    "control:sub2api-managed-site-validate",
    "managedSite",
    SETTINGS_ANCHORS.SUB2API_VALIDATE,
    "settings:sub2apiManagedSite.validation.title",
    683,
    {
      descriptionKey: "settings:sub2apiManagedSite.validation.description",
      breadcrumbsKeys: breadcrumbs,
      keywords: ["sub2api", "validate", "connection"],
    },
  ),
  buildControlDefinition(
    "control:sub2api-managed-site-default-scope",
    "managedSite",
    SETTINGS_ANCHORS.SUB2API_DEFAULT_SCOPE,
    "settings:sub2apiManagedSite.defaultScope.title",
    684,
    {
      descriptionKey: "settings:sub2apiManagedSite.defaultScope.description",
      breadcrumbsKeys: breadcrumbs,
      keywords: ["sub2api", "step up", "totp"],
    },
  ),
]

export const sub2ApiSettingsSearch = defineManagedSiteSettingsSearch(
  SITE_TYPES.SUB2API,
  sections,
  controls,
)
