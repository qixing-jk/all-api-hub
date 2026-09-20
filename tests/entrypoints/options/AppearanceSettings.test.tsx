import { beforeEach, describe, expect, it, vi } from "vitest"

import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import AppearanceSettings from "~/features/BasicSettings/components/tabs/General/AppearanceSettings"
import { render, screen } from "~~/tests/test-utils/render"

vi.mock("~/contexts/UserPreferencesContext", () => ({
  useUserPreferencesContext: vi.fn(),
}))

vi.mock("~/features/Appearance/ThemeModeSettings", () => ({
  default: () => <div data-testid="theme-toggle" />,
}))

vi.mock("~/features/Appearance/AppearanceControls", () => ({
  AppearanceControls: () => <div data-testid="appearance-controls" />,
}))

describe("AppearanceSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      preferences: undefined,
      themeMode: "system",
      updateAppearance: vi.fn().mockResolvedValue({ ok: true }),
    } as any)
  })

  const renderSubject = () =>
    render(<AppearanceSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

  it("keeps theme and typography in one card with the reset in the section header", () => {
    renderSubject()

    expect(
      screen.getByRole("button", { name: "common:actions.reset" }),
    ).toBeInTheDocument()

    const cards = document.querySelectorAll('[data-slot="card"]')
    expect(cards).toHaveLength(1)
    expect(cards[0]).toContainElement(screen.getByTestId("theme-toggle"))
    expect(cards[0]).toContainElement(screen.getByTestId("appearance-controls"))
  })

  it("leaves the interface language to the display section", () => {
    renderSubject()

    expect(
      screen.queryByText("settings:appearanceLanguage.language"),
    ).not.toBeInTheDocument()
  })
})
