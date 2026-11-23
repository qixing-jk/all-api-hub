/**
 * Central branding constants used across the extension codebase.
 *
 * Keep these values stable because they can appear in:
 * - Extension metadata (manifest)
 * - Toolbar tooltip titles
 * - Fallback UI strings in non-extension environments (tests/jsdom)
 */
export const APP_SHORT_NAME = "All API Hub"

/** Use WXT's packaged icon to avoid inlining the source PNG in background bundles. */
export const APP_NOTIFICATION_ICON_PATH = "icons/128.png"
