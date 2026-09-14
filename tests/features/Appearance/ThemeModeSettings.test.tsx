import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { THEME_MODE } from "~/constants/theme"
import ThemeModeSettings from "~/features/Appearance/ThemeModeSettings"
import type { ResolvedTheme, ThemeMode } from "~/types/theme"

const themeState = {
  current: {
    resolvedTheme: THEME_MODE.LIGHT as ResolvedTheme,
    setThemeMode: vi.fn(),
    themeMode: THEME_MODE.LIGHT as ThemeMode,
  },
}

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key}:${JSON.stringify(options)}` : key,
  }),
}))

vi.mock("~/contexts/ThemeContext", () => ({
  useTheme: () => themeState.current,
}))

describe("ThemeModeSettings", () => {
  beforeEach(() => {
    themeState.current = {
      resolvedTheme: THEME_MODE.LIGHT,
      setThemeMode: vi.fn(),
      themeMode: THEME_MODE.LIGHT,
    }
  })

  it("shows the active mode and updates through accessible settings controls", async () => {
    const user = userEvent.setup()
    themeState.current.resolvedTheme = THEME_MODE.DARK
    const { rerender } = render(<ThemeModeSettings />)
    expect(
      document.getElementById(SETTINGS_ANCHORS.APPEARANCE_THEME_MODE),
    ).toBeInTheDocument()
    expect(screen.getByText("theme.selectTheme")).toBeVisible()
    expect(
      screen.getByText(
        'theme.currentTheme:{"theme":"settings:theme.light","resolvedTheme":"theme.dark"}',
      ),
    ).toBeVisible()
    const group = within(
      screen.getByRole("group", { name: "theme.appearance" }),
    )
    expect(
      group.getByRole("button", {
        name: /settings:theme.light/,
        pressed: true,
      }),
    ).toBeVisible()

    for (const [mode, label] of [
      [THEME_MODE.DARK, "settings:theme.dark"],
      [THEME_MODE.SYSTEM, "settings:theme.followSystem"],
      [THEME_MODE.LIGHT, "settings:theme.light"],
    ] as const) {
      const button = group.getByRole("button", { name: new RegExp(label) })
      await user.click(button)
      expect(themeState.current.setThemeMode).toHaveBeenLastCalledWith(mode)
      themeState.current.themeMode = mode
      rerender(<ThemeModeSettings />)
      expect(button).toHaveAttribute("aria-pressed", "true")
      expect(group.getAllByRole("button", { pressed: true })).toHaveLength(1)
    }
  })

  it("describes the resolved light theme when following the system", () => {
    themeState.current.themeMode = THEME_MODE.SYSTEM
    render(<ThemeModeSettings />)
    expect(
      screen.getByText(
        'theme.currentTheme:{"theme":"settings:theme.followSystem","resolvedTheme":"theme.light"}',
      ),
    ).toBeVisible()
    expect(
      screen.getByRole("button", {
        name: /settings:theme.followSystem/,
        pressed: true,
      }),
    ).toHaveAttribute("title", "settings:theme.followSystemTheme")
  })

  it("lets the user recover from an unrecognized stored theme mode", async () => {
    const user = userEvent.setup()
    themeState.current.themeMode = "legacy-theme" as ThemeMode
    const { rerender } = render(<ThemeModeSettings />)

    expect(
      screen.getByText('theme.currentTheme:{"resolvedTheme":"theme.light"}'),
    ).toBeVisible()
    const group = within(
      screen.getByRole("group", { name: "theme.appearance" }),
    )
    expect(group.queryAllByRole("button", { pressed: true })).toHaveLength(0)

    await user.click(
      group.getByRole("button", { name: /settings:theme.light/ }),
    )
    expect(themeState.current.setThemeMode).toHaveBeenCalledWith(
      THEME_MODE.LIGHT,
    )
    themeState.current.themeMode = THEME_MODE.LIGHT
    rerender(<ThemeModeSettings />)

    expect(
      group.getByRole("button", {
        name: /settings:theme.light/,
        pressed: true,
      }),
    ).toBeVisible()
  })
})
