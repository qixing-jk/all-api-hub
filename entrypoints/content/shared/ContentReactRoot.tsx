import React, { useEffect, useState } from "react"

import "~/utils/i18n"
import "~/styles/style.css"

import { ApiCheckModalHost } from "~/entrypoints/content/webAiApiCheck/components/ApiCheckModalHost"
import { userPreferences } from "~/services/preferences/userPreferences"
import type { ResolvedTheme, ThemeMode } from "~/types/theme"
import { createLogger } from "~/utils/logger"

import { RedemptionToaster } from "../redemptionAssist/components/RedemptionToaster"

/**
 * Unified logger scoped to redemption assist content UI root rendering.
 */
const logger = createLogger("ContentReactRoot")

export const ContentReactRoot: React.FC = () => {
  const [themeMode, setThemeMode] = useState<ThemeMode>("system")
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light")

  useEffect(() => {
    let active = true

    const loadPreferences = async () => {
      try {
        const prefs = await userPreferences.getPreferences()
        if (!active) return
        const mode = prefs.themeMode ?? "system"
        setThemeMode(mode)
        if (mode === "system") {
          const isDark = window.matchMedia(
            "(prefers-color-scheme: dark)",
          ).matches
          setResolvedTheme(isDark ? "dark" : "light")
        } else {
          setResolvedTheme(mode)
        }
      } catch (error) {
        logger.warn("Failed to load theme preferences", error)
      }
    }

    void loadPreferences()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (themeMode !== "system") {
      return
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")

    const handleChange = (event: MediaQueryListEvent) => {
      setResolvedTheme(event.matches ? "dark" : "light")
    }

    mediaQuery.addEventListener("change", handleChange)

    return () => {
      mediaQuery.removeEventListener("change", handleChange)
    }
  }, [themeMode])

  const wrapperClassName =
    resolvedTheme === "dark" ? "dark text-foreground bg-background" : ""

  return (
    <div className={wrapperClassName}>
      <ApiCheckModalHost />
      <RedemptionToaster />
    </div>
  )
}
