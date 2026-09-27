import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DEFAULT_THEME_MODE } from "~/constants/theme"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import AppearanceSettings from "~/features/BasicSettings/components/tabs/General/AppearanceSettings"
import { DEFAULT_APPEARANCE } from "~/types/theme"
import { render, screen } from "~~/tests/test-utils/render"

const { updateAppearance } = vi.hoisted(() => ({
  updateAppearance: vi.fn(),
}))

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
    updateAppearance.mockResolvedValue({ ok: true })
    // A non-default appearance keeps the section reset actionable.
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      preferences: {
        appearance: { ...DEFAULT_APPEARANCE, preset: "anthropic" },
      },
      themeMode: "dark",
      updateAppearance,
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

  it("restores the appearance defaults from the section header reset", async () => {
    const user = userEvent.setup()
    renderSubject()

    await user.click(
      screen.getByRole("button", { name: "common:actions.reset" }),
    )

    expect(updateAppearance).toHaveBeenCalledWith({
      ...DEFAULT_APPEARANCE,
      themeMode: DEFAULT_THEME_MODE,
    })
  })

  it("leaves the interface language to the display section", () => {
    renderSubject()

    expect(
      screen.queryByText("settings:appearanceLanguage.language"),
    ).not.toBeInTheDocument()
  })
})
