import {
  SYSTEM_DARK_MODE_QUERY,
  THEME_ATTRIBUTES,
  THEME_OWNER,
} from "~/constants/theme"
import { USER_PREFERENCES_STORAGE_KEYS } from "~/services/core/storageKeys"
import { getLocalStorage } from "~/utils/browser/extensionStorage"
import {
  applyThemePreferences,
  cacheThemePreferences,
  normalizeThemePreferences,
  readCachedThemePreferences,
} from "~/utils/ui/themePreferences"

/** Restore document appearance independently of the application and locale bundles. */
export async function bootstrapAppearance() {
  const root = document.documentElement
  const systemDark = () => window.matchMedia(SYSTEM_DARK_MODE_QUERY).matches
  root.setAttribute(THEME_ATTRIBUTES.OWNER, THEME_OWNER.BOOTSTRAP)
  applyThemePreferences(
    root,
    readCachedThemePreferences() ?? normalizeThemePreferences(undefined),
    systemDark(),
  )

  try {
    const key = USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES
    const stored = (await getLocalStorage(key))[key]
    // Plasmo stores JSON strings. Accept object records for older/imported data.
    const preferences = normalizeThemePreferences(
      typeof stored === "string" ? JSON.parse(stored) : stored,
    )
    // A delayed storage read must not overwrite a newer React preference update.
    if (root.getAttribute(THEME_ATTRIBUTES.OWNER) !== THEME_OWNER.BOOTSTRAP)
      return
    applyThemePreferences(root, preferences, systemDark())
    cacheThemePreferences(preferences)
  } catch {
    // Keep the cached/system shell if storage is temporarily unavailable.
  }
}
