import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { SITE_TYPES } from "~/constants/siteType"
import {
  buildControlDefinition,
  buildSectionDefinition,
  DEFAULT_BREADCRUMBS,
} from "~/entrypoints/options/search/registryHelpers"
import type { OptionsSearchItemDefinition } from "~/entrypoints/options/search/types"

const isSub2Api = (context: { managedSiteType: string }) =>
  context.managedSiteType === SITE_TYPES.SUB2API
const breadcrumbs = [
  ...DEFAULT_BREADCRUMBS,
  "settings:tabs.managedSite",
  "settings:sub2apiManagedSite.title",
]

export const managedSiteSub2ApiSearchSections: OptionsSearchItemDefinition[] = [
  buildSectionDefinition(
    "section:sub2api-managed-site",
    "managedSite",
    SETTINGS_ANCHORS.SUB2API,
    "settings:sub2apiManagedSite.title",
    347,
    { keywords: ["sub2api", "admin api key"], isVisible: isSub2Api },
  ),
]

export const managedSiteSub2ApiSearchControls: OptionsSearchItemDefinition[] = [
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
      isVisible: isSub2Api,
    },
  ),
  buildControlDefinition(
    "control:sub2api-managed-site-admin-api-key",
    "managedSite",
    SETTINGS_ANCHORS.SUB2API_ADMIN_API_KEY,
    "settings:sub2apiManagedSite.fields.adminApiKeyLabel",
    681,
    {
      descriptionKey: "settings:sub2apiManagedSite.fields.adminApiKeyDesc",
      breadcrumbsKeys: breadcrumbs,
      keywords: ["sub2api", "admin api key", "x-api-key"],
      isVisible: isSub2Api,
    },
  ),
  buildControlDefinition(
    "control:sub2api-managed-site-validate",
    "managedSite",
    SETTINGS_ANCHORS.SUB2API_VALIDATE,
    "settings:sub2apiManagedSite.validation.title",
    682,
    {
      descriptionKey: "settings:sub2apiManagedSite.validation.description",
      breadcrumbsKeys: breadcrumbs,
      keywords: ["sub2api", "validate", "connection"],
      isVisible: isSub2Api,
    },
  ),
  buildControlDefinition(
    "control:sub2api-managed-site-default-scope",
    "managedSite",
    SETTINGS_ANCHORS.SUB2API_DEFAULT_SCOPE,
    "settings:sub2apiManagedSite.defaultScope.title",
    683,
    {
      descriptionKey: "settings:sub2apiManagedSite.defaultScope.description",
      breadcrumbsKeys: breadcrumbs,
      keywords: ["sub2api", "step up", "totp"],
      isVisible: isSub2Api,
    },
  ),
]
