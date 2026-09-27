import { APP_SHORT_NAME } from "~/constants/branding"

import {
  DEV_BUILD_MARKER,
  truncateDevLabel,
  type DevIdentity,
} from "./devIdentity"

/**
 * Longest instance label kept inside a dev-only menu entry. Context menu items
 * have no tooltip, so the label has to stay readable on its own.
 */
const DEV_MENU_LABEL_MAX_LENGTH = 32

/**
 * Creates a dev-only tooltip title for the toolbar action.
 *
 * The full source path is included because the toolbar tooltip is the only place
 * that answers "which checkout is this?" without opening an extension page.
 */
export function formatDevActionTitle(
  baseTitle: string,
  versionName?: string,
  path?: string | null,
) {
  const safeBase = baseTitle?.trim() || APP_SHORT_NAME
  const safeVersion = versionName?.trim() || ""
  const safePath = path?.trim() || ""

  let titled = safeBase
  if (safeVersion) {
    if (!titled.includes(safeVersion)) titled = `${titled} (${safeVersion})`
  } else if (!titled.includes(DEV_BUILD_MARKER)) {
    // Development manifest names already carry the marker, so only add it when
    // the title comes from somewhere else, such as the localized manifest name.
    titled = `${titled} ${DEV_BUILD_MARKER}`
  }

  return safePath && !titled.includes(safePath)
    ? `${titled} · ${safePath}`
    : titled
}

/**
 * The identity label for surfaces that are not forced to be short: the shortened
 * source path when the build baked one, and the badge code only when it did not.
 */
export function formatDevInstanceLabel(
  identity: DevIdentity,
  maxLength?: number,
) {
  const label = identity.pathTail ?? identity.badgeText

  return maxLength ? truncateDevLabel(label, maxLength) : label
}

/**
 * Prefix that marks dev instances in text-only surfaces such as context menus,
 * where colors are unavailable and the path has to carry the identity alone.
 *
 * Returns an empty string outside development mode, which the identity signals
 * by having no palette color, so release surfaces stay untouched.
 */
export function formatDevInstancePrefix(
  identity: DevIdentity,
  maxLength = DEV_MENU_LABEL_MAX_LENGTH,
) {
  if (!identity.color) return ""

  return `[${formatDevInstanceLabel(identity, maxLength)}] `
}

/** Suffix that ties an extension page title back to the toolbar icon. */
export function formatDevTitleSuffix(identity: DevIdentity) {
  return identity.pathTail ? ` · ${identity.pathTail}` : ""
}
