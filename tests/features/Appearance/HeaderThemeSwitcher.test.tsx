import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { THEME_MODE } from "~/constants/theme"
import HeaderThemeSwitcher from "~/features/Appearance/HeaderThemeSwitcher"
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

vi.mock("~/contexts/UserPreferencesContext", () => ({
  useUserPreferencesContext: () => ({
    preferences: {},
    themeMode: themeState.current.themeMode,
    updateAppearance: vi.fn(),
  }),
}))

describe("HeaderThemeSwitcher", () => {
  beforeEach(() => {
    themeState.current = {
      resolvedTheme: THEME_MODE.LIGHT,
      setThemeMode: vi.fn(),
      themeMode: THEME_MODE.LIGHT,
    }
  })

  it("describes the current theme and applies selections through the real menu", async () => {
    const user = userEvent.setup()
    themeState.current.resolvedTheme = THEME_MODE.DARK
    const { rerender } = render(<HeaderThemeSwitcher />)
    const triggerLabel =
      'theme.current:{"theme":"settings:theme.light","resolvedTheme":"settings:theme.dark"}'
    const trigger = screen.getByRole("button", { name: triggerLabel })
    await user.tab()
    expect(await screen.findByRole("tooltip")).toHaveTextContent(triggerLabel)

    for (const [mode, label] of [
      [THEME_MODE.DARK, "settings:theme.dark"],
      [THEME_MODE.SYSTEM, "settings:theme.followSystem"],
      [THEME_MODE.LIGHT, "settings:theme.light"],
    ] as const) {
      await user.click(trigger)
      expect(screen.getAllByRole("menuitemradio")).toHaveLength(3)
      await user.click(screen.getByRole("menuitemradio", { name: label }))
      expect(themeState.current.setThemeMode).toHaveBeenLastCalledWith(mode)
      await waitFor(() =>
        expect(screen.queryByRole("menu")).not.toBeInTheDocument(),
      )

      themeState.current.themeMode = mode
      rerender(<HeaderThemeSwitcher />)
      await user.click(trigger)
      expect(
        screen.getByRole("menuitemradio", { name: label }),
      ).toHaveAttribute("aria-checked", "true")
      await user.keyboard("{Escape}")
    }
    expect(themeState.current.setThemeMode).toHaveBeenCalledTimes(3)
  })

  it.each(["legacy-theme", "constructor"])(
    "falls back for the invalid stored mode %s and allows recovery",
    async (mode) => {
      const user = userEvent.setup()
      themeState.current.themeMode = mode as ThemeMode
      render(<HeaderThemeSwitcher />)
      const label =
        'theme.current:{"theme":"settings:theme.followSystem","resolvedTheme":"settings:theme.light"}'
      const trigger = screen.getByRole("button", { name: label })
      await user.tab()
      expect(await screen.findByRole("tooltip")).toHaveTextContent(label)
      await user.click(trigger)
      await user.click(
        screen.getByRole("menuitemradio", { name: "settings:theme.light" }),
      )
      expect(themeState.current.setThemeMode).toHaveBeenCalledWith(
        THEME_MODE.LIGHT,
      )
    },
  )

  it("opens the appearance drawer from the menu and restores trigger focus on close", async () => {
    const user = userEvent.setup()
    render(<HeaderThemeSwitcher />)
    const trigger = screen.getByRole("button", { name: /^theme.current:/ })
    await user.click(trigger)
    await user.click(screen.getByRole("menuitem", { name: "appearance.title" }))
    expect(
      await screen.findByRole("dialog", { name: "appearance.title" }),
    ).toBeVisible()
    await user.keyboard("{Escape}")
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    )
    expect(trigger).toHaveFocus()
  })
})
