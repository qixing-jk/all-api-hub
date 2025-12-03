import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"

import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import type { ResolvedTheme, ThemeMode } from "~/types/theme"

interface ThemeContextValue {
  themeMode: ThemeMode
  resolvedTheme: ResolvedTheme
  setThemeMode: (mode: ThemeMode) => Promise<void>
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const { themeMode, updateThemeMode } = useUserPreferencesContext()
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light")

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")

    const handleChange = (e: MediaQueryListEvent) => {
      if (themeMode === "system") {
        setResolvedTheme(e.matches ? "dark" : "light")
      }
    }

    mediaQuery.addEventListener("change", handleChange)
    return () => mediaQuery.removeEventListener("change", handleChange)
  }, [themeMode])

  useEffect(() => {
    if (themeMode === "system") {
      const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches
      setResolvedTheme(isDark ? "dark" : "light")
    } else {
      setResolvedTheme(themeMode)
    }
  }, [themeMode])

  useEffect(() => {
    const root = document.documentElement
    if (resolvedTheme === "dark") {
      root.classList.add("dark")
    } else {
      root.classList.remove("dark")
    }
  }, [resolvedTheme])

  const setThemeMode = async (mode: ThemeMode) => {
    await updateThemeMode(mode)
  }

  const value = {
    themeMode,
    resolvedTheme,
    setThemeMode,
  }

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export const useTheme = () => {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider")
  }
  return context
}
