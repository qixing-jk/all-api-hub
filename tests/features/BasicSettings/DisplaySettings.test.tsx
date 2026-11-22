import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import DisplaySettings from "~/features/BasicSettings/components/tabs/General/DisplaySettings"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { render, screen } from "~~/tests/test-utils/render"

const { usePreferences, updateCurrencyDisplay } = vi.hoisted(() => ({
  usePreferences: vi.fn(),
  updateCurrencyDisplay: vi.fn(),
}))

vi.mock("~/contexts/UserPreferencesContext", () => ({
  useUserPreferencesContext: usePreferences,
}))
vi.mock("~/components/LanguageSwitcher", () => ({
  LanguageSwitcher: () => null,
}))

describe("display currency settings", () => {
  it("accepts a return to Original while selecting USD is still pending", async () => {
    updateCurrencyDisplay.mockImplementation(() => new Promise(() => {}))
    usePreferences.mockReturnValue({
      ...DEFAULT_PREFERENCES,
      updateCurrencyDisplay,
    })
    const user = userEvent.setup()
    render(<DisplaySettings />, { withUserPreferencesProvider: false })
    await user.click(
      screen.getByRole("button", { name: "settings:display.usd" }),
    )
    await user.click(
      screen.getByRole("button", { name: "settings:display.original" }),
    )
    expect(updateCurrencyDisplay.mock.calls).toEqual([["USD"], ["original"]])
  })

  it.each([
    ["USD", true],
    ["CNY", false],
  ] as const)(
    "reflects the saved %s reference currency in Reset availability",
    (currencyType, disabled) => {
      usePreferences.mockReturnValue({
        ...DEFAULT_PREFERENCES,
        currencyType,
        resetDisplaySettings: vi.fn(),
      })
      render(<DisplaySettings />, { withUserPreferencesProvider: false })
      expect(
        screen.getByRole("button", { name: "common:actions.reset" }),
      ).toHaveProperty("disabled", disabled)
    },
  )
})
