import type { TFunction } from "i18next"

import type { ManifestOptionalPermissions } from "./permissionManager"

/** Resolve the localized title for a supported optional permission. */
export function getOptionalPermissionTitle(
  t: TFunction,
  id: ManifestOptionalPermissions,
) {
  switch (id) {
    case "cookies":
      return t("settings:permissions.items.cookies.title")
    case "declarativeNetRequestWithHostAccess":
      return t(
        "settings:permissions.items.declarativeNetRequestWithHostAccess.title",
      )
    case "webRequest":
      return t("settings:permissions.items.webRequest.title")
    case "webRequestBlocking":
      return t("settings:permissions.items.webRequestBlocking.title")
    case "clipboardRead":
      return t("settings:permissions.items.clipboardRead.title")
    case "notifications":
      return t("settings:permissions.items.notifications.title")
    case "bookmarks":
      return t("settings:permissions.items.bookmarks.title")
  }
}

/** Resolve the localized description for a supported optional permission. */
export function getOptionalPermissionDescription(
  t: TFunction,
  id: ManifestOptionalPermissions,
) {
  switch (id) {
    case "cookies":
      return t("settings:permissions.items.cookies.description")
    case "declarativeNetRequestWithHostAccess":
      return t(
        "settings:permissions.items.declarativeNetRequestWithHostAccess.description",
      )
    case "webRequest":
      return t("settings:permissions.items.webRequest.description")
    case "webRequestBlocking":
      return t("settings:permissions.items.webRequestBlocking.description")
    case "clipboardRead":
      return t("settings:permissions.items.clipboardRead.description")
    case "notifications":
      return t("settings:permissions.items.notifications.description")
    case "bookmarks":
      return t("settings:permissions.items.bookmarks.description")
  }
}
