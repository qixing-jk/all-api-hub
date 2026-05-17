import { describe, expect, it, vi } from "vitest"

import AppearanceSettings from "~/features/BasicSettings/components/tabs/General/AppearanceSettings"
import { render, screen } from "~~/tests/test-utils/render"

const languageSwitcherMock = vi.fn()

vi.mock("~/components/LanguageSwitcher", () => ({
  LanguageSwitcher: (props: Record<string, unknown>) => {
    languageSwitcherMock(props)
    return <div data-testid="language-switcher" />
  },
}))

vi.mock("~/entrypoints/options/components/ThemeToggle", () => ({
  default: () => <div data-testid="theme-toggle" />,
}))

describe("AppearanceSettings", () => {
  it("uses the select language switcher in the settings card", () => {
    render(<AppearanceSettings />, {
      withReleaseUpdateStatusProvider: false,
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    expect(screen.getByTestId("language-switcher")).toBeInTheDocument()
    expect(screen.getByTestId("theme-toggle")).toBeInTheDocument()
    expect(languageSwitcherMock).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "select" }),
    )
  })
})
