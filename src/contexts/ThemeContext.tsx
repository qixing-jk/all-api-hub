import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react"

import {
  SYSTEM_DARK_MODE_QUERY,
  THEME_ATTRIBUTES,
  THEME_MODE,
  THEME_OWNER,
} from "~/constants/theme"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { type ResolvedTheme, type ThemeMode } from "~/types/theme"
import {
  applyThemePreferences,
  cacheThemePreferences,
  normalizeThemePreferences,
  resolveThemeMode,
} from "~/utils/ui/themePreferences"

interface ThemeContextValue {
  themeMode: ThemeMode
  resolvedTheme: ResolvedTheme
  setThemeMode: (mode: ThemeMode) => Promise<void>
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

/**
 * High-level provider that keeps the resolved theme in sync with user
 * preferences and system color scheme, exposing the mode setter to children.
 */
export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const { themeMode, updateThemeMode, preferences, isLoading } =
    useUserPreferencesContext()
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia(SYSTEM_DARK_MODE_QUERY).matches,
  )
  const resolvedTheme: ResolvedTheme = isLoading
    ? document.documentElement.classList.contains(THEME_MODE.DARK)
      ? THEME_MODE.DARK
      : THEME_MODE.LIGHT
    : resolveThemeMode(themeMode, systemDark)

  useEffect(() => {
    const mediaQuery = window.matchMedia(SYSTEM_DARK_MODE_QUERY)

    const handleChange = (e: MediaQueryListEvent) => {
      setSystemDark(e.matches)
    }

    mediaQuery.addEventListener("change", handleChange)
    return () => mediaQuery.removeEventListener("change", handleChange)
  }, [])

  useLayoutEffect(() => {
    if (isLoading) return
    const root = document.documentElement
    const normalized = normalizeThemePreferences({
      themeMode,
      appearance: preferences?.appearance,
    })
    root.setAttribute(THEME_ATTRIBUTES.OWNER, THEME_OWNER.REACT)
    applyThemePreferences(root, normalized, systemDark)
    cacheThemePreferences(normalized)
  }, [themeMode, preferences?.appearance, isLoading, systemDark])

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

/**
 * Hook wrapper around {@link ThemeContext} that throws when used outside the
 * provider, ensuring components always receive live theme metadata.
 */
export const useTheme = () => {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider")
  }
  return context
}
