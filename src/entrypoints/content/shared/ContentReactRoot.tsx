import React, { useEffect, useState } from "react"

import "~/utils/i18n"
import "~/styles/style.css"

import { ApiCheckModalHost } from "~/entrypoints/content/webAiApiCheck/components/ApiCheckModalHost"
import { userPreferences } from "~/services/preferences/userPreferences"
import type { ResolvedTheme } from "~/types/theme"
import { createLogger } from "~/utils/core/logger"

import { RedemptionToaster } from "../redemptionAssist/components/RedemptionToaster"

/**
 * Unified logger scoped to redemption assist content UI root rendering.
 */
const logger = createLogger("ContentReactRoot")

export const ContentReactRoot: React.FC = () => {
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light")

  useEffect(() => {
    let active = true
    let removeSystemThemeListener: (() => void) | undefined

    const loadPreferences = async () => {
      try {
        const prefs = await userPreferences.getPreferences()
        if (!active) return
        const mode = prefs.themeMode ?? "system"
        if (mode === "system") {
          const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")

          const syncResolvedTheme = (isDark: boolean) => {
            if (!active) return
            setResolvedTheme(isDark ? "dark" : "light")
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

    void loadPreferences()

    return () => {
      active = false
      removeSystemThemeListener?.()
    }
  }, [])

  const wrapperClassName =
    resolvedTheme === "dark" ? "dark text-foreground bg-background" : ""

  return (
    <div className={wrapperClassName}>
      <ApiCheckModalHost />
      <RedemptionToaster />
    </div>
  )
}
