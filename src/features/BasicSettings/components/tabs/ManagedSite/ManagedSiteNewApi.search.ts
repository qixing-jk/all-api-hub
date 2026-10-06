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
    "section:new-api",
    "managedSite",
    "new-api",
    "settings:newApi.title",
    341,
    {
      keywordKeys: ["common:actions.reset"],
      keywords: ["new-api"],
    },
  ),
]

const controls: OptionsSearchItemDefinition[] = [
  buildControlDefinition(
    "control:new-api-base-url",
    "managedSite",
    "new-api-base-url",
    "settings:newApi.fields.baseUrlLabel",
    641,
    {
      descriptionKey: "settings:newApi.urlDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.managedSite",
        "settings:newApi.title",
      ],
      keywords: ["new-api", "base url"],
    },
  ),
  buildControlDefinition(
    "control:new-api-admin-token",
    "managedSite",
    "new-api-admin-token",
    "settings:newApi.fields.adminTokenLabel",
    642,
    {
      descriptionKey: "settings:newApi.tokenDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.managedSite",
        "settings:newApi.title",
      ],
      keywords: ["new-api", "token", "admin token"],
    },
  ),
  buildControlDefinition(
    "control:new-api-user-id",
    "managedSite",
    "new-api-user-id",
    "settings:newApi.fields.userIdLabel",
    643,
    {
      descriptionKey: "settings:newApi.userIdDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.managedSite",
        "settings:newApi.title",
      ],
      keywords: ["new-api", "user id"],
    },
  ),
  buildControlDefinition(
    "control:new-api-username",
    "managedSite",
    "new-api-username",
    "settings:newApi.fields.usernameLabel",
    644,
    {
      descriptionKey: "settings:newApi.fields.usernameDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.managedSite",
        "settings:newApi.title",
      ],
      keywords: ["new-api", "username", "login"],
    },
  ),
  buildControlDefinition(
    "control:new-api-password",
    "managedSite",
    "new-api-password",
    "settings:newApi.fields.passwordLabel",
    645,
    {
      descriptionKey: "settings:newApi.fields.passwordDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.managedSite",
        "settings:newApi.title",
      ],
      keywords: ["new-api", "password", "login"],
    },
  ),
  buildControlDefinition(
    "control:new-api-totp-secret",
    "managedSite",
    SETTINGS_ANCHORS.NEW_API_TOTP_SECRET,
    "settings:newApi.fields.totpSecretLabel",
    646,
    {
      descriptionKey: "settings:newApi.fields.totpSecretDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.managedSite",
        "settings:newApi.title",
      ],
      keywords: ["new-api", "totp", "2fa"],
    },
  ),
  buildControlDefinition(
    "control:new-api-admin-credentials-link",
    "managedSite",
    "new-api-base-url",
    "settings:newApi.adminCredentialsLink.title",
    647,
    {
      descriptionKey: "settings:newApi.adminCredentialsLink.description",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.managedSite",
        "settings:newApi.title",
      ],
      keywords: ["new-api", "admin credentials", "login", "base url"],
    },
  ),
  buildControlDefinition(
    "control:new-api-session-test",
    "managedSite",
    "new-api-session-test",
    "settings:newApi.sessionTest.title",
    648,
    {
      descriptionKey: "settings:newApi.sessionTest.description",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.managedSite",
        "settings:newApi.title",
      ],
      keywords: ["new-api", "session", "test", "totp"],
    },
  ),
]

export const newApiSettingsSearch = defineManagedSiteSettingsSearch(
  SITE_TYPES.NEW_API,
  sections,
  controls,
)
