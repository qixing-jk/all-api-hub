import { SITE_TYPES } from "~/constants/siteType"
import {
  buildControlDefinition,
  buildSectionDefinition,
  DEFAULT_BREADCRUMBS,
} from "~/entrypoints/options/search/registryHelpers"
import type { OptionsSearchItemDefinition } from "~/entrypoints/options/search/types"

export const managedSiteNewApiSearchSections: OptionsSearchItemDefinition[] = [
  buildSectionDefinition(
    "section:new-api",
    "managedSite",
    "new-api",
    "settings:newApi.title",
    341,
    {
      keywords: ["new-api"],
      isVisible: (context) => context.managedSiteType === SITE_TYPES.NEW_API,
    },
  ),
]

export const managedSiteNewApiSearchControls: OptionsSearchItemDefinition[] = [
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
      isVisible: (context) => context.managedSiteType === SITE_TYPES.NEW_API,
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
      isVisible: (context) => context.managedSiteType === SITE_TYPES.NEW_API,
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
      isVisible: (context) => context.managedSiteType === SITE_TYPES.NEW_API,
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
      isVisible: (context) => context.managedSiteType === SITE_TYPES.NEW_API,
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
      isVisible: (context) => context.managedSiteType === SITE_TYPES.NEW_API,
    },
  ),
  buildControlDefinition(
    "control:new-api-totp-secret",
    "managedSite",
    "new-api-totp-secret",
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
      isVisible: (context) => context.managedSiteType === SITE_TYPES.NEW_API,
    },
  ),
  buildControlDefinition(
    "control:new-api-admin-credentials-link",
    "managedSite",
    "new-api-admin-credentials-link",
    "settings:newApi.adminCredentialsLink.title",
    647,
    {
      descriptionKey: "settings:newApi.adminCredentialsLink.description",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.managedSite",
        "settings:newApi.title",
      ],
      keywords: ["new-api", "admin credentials", "login"],
      isVisible: (context) => context.managedSiteType === SITE_TYPES.NEW_API,
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
      isVisible: (context) => context.managedSiteType === SITE_TYPES.NEW_API,
    },
  ),
]
