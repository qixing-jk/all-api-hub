import {
  buildControlDefinition,
  buildSectionDefinition,
  DEFAULT_BREADCRUMBS,
} from "~/entrypoints/options/search/registryHelpers"
import type { OptionsSearchItemDefinition } from "~/entrypoints/options/search/types"

export const permissionsSearchSections: OptionsSearchItemDefinition[] = [
  buildSectionDefinition(
    "section:permissions",
    "permissions",
    "permissions",
    "settings:permissions.title",
    400,
    {
      isVisible: (context) => context.hasOptionalPermissions,
    },
  ),
]

export const permissionsSearchControls: OptionsSearchItemDefinition[] = [
  buildControlDefinition(
    "control:permissions-refresh",
    "permissions",
    "permissions-refresh-status",
    "settings:permissions.actions.refresh",
    700,
    {
      descriptionKey: "settings:permissions.statusCaption",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.permissions",
        "settings:permissions.title",
      ],
      keywords: ["permission", "refresh", "cookies", "webrequest"],
      isVisible: (context) => context.hasOptionalPermissions,
    },
  ),
  buildControlDefinition(
    "control:permissions-cookies",
    "permissions",
    "cookies",
    "settings:permissions.items.cookies.title",
    701,
    {
      descriptionKey: "settings:permissions.items.cookies.description",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.permissions",
        "settings:permissions.title",
      ],
      keywords: ["permission", "cookies", "cookie"],
      isVisible: (context) => context.hasOptionalPermissions,
    },
  ),
  buildControlDefinition(
    "control:permissions-dnr-host-access",
    "permissions",
    "declarativeNetRequestWithHostAccess",
    "settings:permissions.items.declarativeNetRequestWithHostAccess.title",
    702,
    {
      descriptionKey:
        "settings:permissions.items.declarativeNetRequestWithHostAccess.description",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.permissions",
        "settings:permissions.title",
      ],
      keywords: ["permission", "declarativeNetRequest", "host access", "dnr"],
      isVisible: (context) => context.hasOptionalPermissions,
    },
  ),
  buildControlDefinition(
    "control:permissions-webrequest",
    "permissions",
    "webRequest",
    "settings:permissions.items.webRequest.title",
    703,
    {
      descriptionKey: "settings:permissions.items.webRequest.description",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.permissions",
        "settings:permissions.title",
      ],
      keywords: ["permission", "webrequest", "network"],
      isVisible: (context) => context.hasOptionalPermissions,
    },
  ),
  buildControlDefinition(
    "control:permissions-webrequest-blocking",
    "permissions",
    "webRequestBlocking",
    "settings:permissions.items.webRequestBlocking.title",
    704,
    {
      descriptionKey:
        "settings:permissions.items.webRequestBlocking.description",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.permissions",
        "settings:permissions.title",
      ],
      keywords: ["permission", "webrequest blocking", "blocking"],
      isVisible: (context) => context.hasOptionalPermissions,
    },
  ),
  buildControlDefinition(
    "control:permissions-clipboard-read",
    "permissions",
    "clipboardRead",
    "settings:permissions.items.clipboardRead.title",
    705,
    {
      descriptionKey: "settings:permissions.items.clipboardRead.description",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.permissions",
        "settings:permissions.title",
      ],
      keywords: ["permission", "clipboard", "clipboard read"],
      isVisible: (context) => context.hasOptionalPermissions,
    },
  ),
  buildControlDefinition(
    "control:permissions-notifications",
    "permissions",
    "notifications",
    "settings:permissions.items.notifications.title",
    706,
    {
      descriptionKey: "settings:permissions.items.notifications.description",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.permissions",
        "settings:permissions.title",
      ],
      keywords: ["permission", "notification", "system notification"],
      isVisible: (context) => context.hasOptionalPermissions,
    },
  ),
]
