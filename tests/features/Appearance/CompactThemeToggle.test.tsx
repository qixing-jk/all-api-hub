import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { THEME_MODE } from "~/constants/theme"
import CompactThemeToggle from "~/features/Appearance/CompactThemeToggle"
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

describe("CompactThemeToggle", () => {
  beforeEach(() => {
    themeState.current = {
      resolvedTheme: THEME_MODE.LIGHT,
      setThemeMode: vi.fn(),
      themeMode: THEME_MODE.LIGHT,
    }
  })

  it.each([
    [
      THEME_MODE.LIGHT,
      "settings:theme.light",
      THEME_MODE.DARK,
      "settings:theme.dark",
    ],
    [
      THEME_MODE.DARK,
      "settings:theme.dark",
      THEME_MODE.SYSTEM,
      "settings:theme.followSystem",
    ],
    [
      THEME_MODE.SYSTEM,
      "settings:theme.followSystem",
      THEME_MODE.LIGHT,
      "settings:theme.light",
    ],
    [
      "legacy-theme",
      "settings:theme.followSystem",
      THEME_MODE.LIGHT,
      "settings:theme.light",
    ],
    [
      "constructor",
      "settings:theme.followSystem",
      THEME_MODE.LIGHT,
      "settings:theme.light",
    ],
  ] as const)(
    "cycles %s to the next mode and exposes both labels",
    async (mode, currentLabel, nextMode, nextLabel) => {
      const user = userEvent.setup()
      themeState.current.themeMode = mode as ThemeMode
      render(<CompactThemeToggle />)
      const button = screen.getByRole("button", {
        name: `theme.toggle:${JSON.stringify({ currentMode: currentLabel, nextMode: nextLabel })}`,
      })
      const resolvedLabel =
        mode === THEME_MODE.SYSTEM ? "settings:theme.light" : currentLabel
      await user.tab()
      expect(await screen.findByRole("tooltip")).toHaveTextContent(
        `theme.current:${JSON.stringify({ theme: currentLabel, resolvedTheme: resolvedLabel })} theme.clickSwitch:${JSON.stringify({ nextMode: nextLabel })}`,
      )
      await user.click(button)
      expect(themeState.current.setThemeMode).toHaveBeenCalledWith(nextMode)
    },
  )

  it("describes the resolved dark mode when following the system", async () => {
    const user = userEvent.setup()
    themeState.current.themeMode = THEME_MODE.SYSTEM
    themeState.current.resolvedTheme = THEME_MODE.DARK
    render(<CompactThemeToggle />)
    await user.tab()
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      'theme.current:{"theme":"settings:theme.followSystem","resolvedTheme":"settings:theme.dark"} theme.clickSwitch:{"nextMode":"settings:theme.light"}',
    )
  })
})
