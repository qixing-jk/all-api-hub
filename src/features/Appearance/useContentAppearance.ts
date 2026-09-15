import { useEffect, useState } from "react"

import { Storage } from "@plasmohq/storage"

import {
  DEFAULT_THEME_MODE,
  SYSTEM_DARK_MODE_QUERY,
  THEME_MODE,
} from "~/constants/theme"
import { USER_PREFERENCES_STORAGE_KEYS } from "~/services/core/storageKeys"
import { userPreferences } from "~/services/preferences/userPreferences"
import {
  DEFAULT_APPEARANCE,
  normalizeAppearance,
  type ResolvedTheme,
} from "~/types/theme"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("ContentReactRoot")

/** Keep content UI appearance live without applying preferences to the host page. */
export function useContentAppearance() {
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(
    THEME_MODE.LIGHT,
  )
  const [appearance, setAppearance] = useState(DEFAULT_APPEARANCE)

  useEffect(() => {
    let active = true
    let revision = 0
    let removeSystemThemeListener: (() => void) | undefined

    const loadPreferences = async () => {
      const currentRevision = ++revision
      try {
        const prefs = await userPreferences.getPreferences()
        if (!active || currentRevision !== revision) return
        removeSystemThemeListener?.()
        removeSystemThemeListener = undefined
        setAppearance(normalizeAppearance(prefs.appearance))
        const mode = prefs.themeMode ?? DEFAULT_THEME_MODE
        if (mode === THEME_MODE.SYSTEM) {
          const mediaQuery = window.matchMedia(SYSTEM_DARK_MODE_QUERY)

          const syncResolvedTheme = (isDark: boolean) => {
            if (!active) return
            setResolvedTheme(isDark ? THEME_MODE.DARK : THEME_MODE.LIGHT)
          }

          const handleChange = (event: MediaQueryListEvent) => {
            syncResolvedTheme(event.matches)
          }

          mediaQuery.addEventListener("change", handleChange)
          removeSystemThemeListener = () => {
            mediaQuery.removeEventListener("change", handleChange)
          }

          syncResolvedTheme(mediaQuery.matches)
        } else {
          setResolvedTheme(mode)
        }
      } catch (error) {
        logger.warn("Failed to load theme preferences", error)
      }
    }

    const storage = new Storage({ area: "local" })
    const callbacks = {
      [USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES]: () => {
        void loadPreferences()
      },
    }
    storage.watch(callbacks)
    void loadPreferences()

    return () => {
      active = false
      storage.unwatch(callbacks)
      removeSystemThemeListener?.()
    }
  }, [])

  return { resolvedTheme, appearance }
}
