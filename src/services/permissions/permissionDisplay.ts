import type { TFunction } from "i18next"

import type { ManifestOptionalPermissions } from "./permissionManager"

const OPTIONAL_PERMISSION_TRANSLATION_BASE_KEYS = {
  cookies: "settings:permissions.items.cookies",
  declarativeNetRequestWithHostAccess:
    "settings:permissions.items.declarativeNetRequestWithHostAccess",
  webRequest: "settings:permissions.items.webRequest",
  webRequestBlocking: "settings:permissions.items.webRequestBlocking",
  clipboardRead: "settings:permissions.items.clipboardRead",
  notifications: "settings:permissions.items.notifications",
  bookmarks: "settings:permissions.items.bookmarks",
} satisfies Record<ManifestOptionalPermissions, string>

/** Resolve the localized title for a supported optional permission. */
export function getOptionalPermissionTitle(
  t: TFunction,
  id: ManifestOptionalPermissions,
) {
  return t(`${OPTIONAL_PERMISSION_TRANSLATION_BASE_KEYS[id]}.title`)
}

/** Resolve the localized description for a supported optional permission. */
export function getOptionalPermissionDescription(
  t: TFunction,
  id: ManifestOptionalPermissions,
) {
  return t(`${OPTIONAL_PERMISSION_TRANSLATION_BASE_KEYS[id]}.description`)
}
