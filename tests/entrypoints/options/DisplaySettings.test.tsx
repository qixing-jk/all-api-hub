import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DATA_TYPE_BALANCE, DATA_TYPE_CASHFLOW } from "~/constants"
import { CURRENCIES, CURRENCY_DISPLAY_MODES } from "~/constants/money"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import DisplaySettings from "~/features/BasicSettings/components/tabs/General/DisplaySettings"
import { showUpdateToast } from "~/utils/feedback/preferenceFeedback"
import { testI18n } from "~~/tests/test-utils/i18n"

vi.mock("~/contexts/UserPreferencesContext", () => ({
  useUserPreferencesContext: vi.fn(),
}))

vi.mock("~/utils/feedback/preferenceFeedback", () => ({
  showUpdateToast: vi.fn(),
}))

describe("DisplaySettings", () => {
  it("offers original currencies beside the two converted currencies", async () => {
    const updateCurrencyDisplay = vi.fn().mockResolvedValue({ ok: true })
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      ...vi.mocked(useUserPreferencesContext)(),
      currencyDisplay: CURRENCIES.USD,
      updateCurrencyDisplay,
    })
    renderSubject()
    fireEvent.click(
      screen.getByRole("button", { name: "settings:display.original" }),
    )
    await waitFor(() =>
      expect(updateCurrencyDisplay).toHaveBeenCalledWith("original"),
    )
  })
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      activeTab: DATA_TYPE_BALANCE,
      currencyType: CURRENCIES.USD,
      currencyDisplay: CURRENCY_DISPLAY_MODES.Original,
      showTodayCashflow: true,
      updateCurrencyDisplay: vi.fn().mockResolvedValue({ ok: true }),
      updateDefaultTab: vi.fn().mockResolvedValue({ ok: true }),
      updateShowTodayCashflow: vi.fn().mockResolvedValue({ ok: true }),
      resetDisplaySettings: vi.fn().mockResolvedValue({ ok: true }),
    } as any)
  })

  const renderSubject = () =>
    render(
      <I18nextProvider i18n={testI18n}>
        <DisplaySettings />
      </I18nextProvider>,
    )

  it.each([
    [CURRENCIES.USD, true],
    [CURRENCIES.CNY, false],
  ] as const)(
    "reflects the remembered %s reference currency in reset availability",
    (currencyType, disabled) => {
      const context = vi.mocked(useUserPreferencesContext)()
      vi.mocked(useUserPreferencesContext).mockReturnValue({
        ...context,
        currencyType,
        activeTab: DATA_TYPE_CASHFLOW,
      })
      renderSubject()
      expect(
        screen.getByRole("button", { name: "common:actions.reset" }),
      ).toHaveProperty("disabled", disabled)
    },
  )

  it("accepts Original while the previous currency selection is pending", () => {
    const updateCurrencyDisplay = vi.fn(() => new Promise(() => {}))
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      ...vi.mocked(useUserPreferencesContext)(),
      updateCurrencyDisplay,
    })
    renderSubject()

    fireEvent.click(
      screen.getByRole("button", { name: "settings:display.usd" }),
    )
    fireEvent.click(
      screen.getByRole("button", { name: "settings:display.original" }),
    )
    expect(updateCurrencyDisplay.mock.calls).toEqual([["USD"], ["original"]])
  })

  it("offers the interface language beside the display preferences", () => {
    renderSubject()

    expect(
      screen.getByText("settings:appearanceLanguage.language"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("settings:appearanceLanguage.languageDesc"),
    ).toBeInTheDocument()
  })

  it("shows result-aware feedback after changing the currency", async () => {
    const writeResult = { ok: true as const }
    const updateCurrencyDisplay = vi.fn().mockResolvedValue(writeResult)
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      activeTab: DATA_TYPE_BALANCE,
      currencyType: CURRENCIES.USD,
      showTodayCashflow: true,
      updateCurrencyDisplay,
      updateDefaultTab: vi.fn().mockResolvedValue({ ok: true }),
      updateShowTodayCashflow: vi.fn().mockResolvedValue({ ok: true }),
      resetDisplaySettings: vi.fn().mockResolvedValue({ ok: true }),
    } as any)

    renderSubject()

    fireEvent.click(
      screen.getByRole("button", { name: "settings:display.cny" }),
    )

    await waitFor(() => {
      expect(updateCurrencyDisplay).toHaveBeenCalledWith("CNY")
      expect(showUpdateToast).toHaveBeenCalledWith(
        writeResult,
        "settings:display.currencyUnit",
      )
    })
  })

  it("does not save the hidden cashflow tab while today cashflow is disabled", async () => {
    const updateDefaultTab = vi.fn().mockResolvedValue({ ok: true })
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      activeTab: DATA_TYPE_BALANCE,
      currencyType: CURRENCIES.USD,
      showTodayCashflow: false,
      updateCurrencyDisplay: vi.fn().mockResolvedValue({ ok: true }),
      updateDefaultTab,
      updateShowTodayCashflow: vi.fn().mockResolvedValue({ ok: true }),
      resetDisplaySettings: vi.fn().mockResolvedValue({ ok: true }),
    } as any)

    renderSubject()

    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:display.todayCashflow",
      }),
    )

    expect(updateDefaultTab).not.toHaveBeenCalled()
    expect(showUpdateToast).not.toHaveBeenCalled()
  })

  it("shows result-aware feedback after changing the default tab", async () => {
    const writeResult = { ok: true as const }
    const updateDefaultTab = vi.fn().mockResolvedValue(writeResult)
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      activeTab: DATA_TYPE_BALANCE,
      currencyType: CURRENCIES.USD,
      showTodayCashflow: true,
      updateCurrencyDisplay: vi.fn().mockResolvedValue({ ok: true }),
      updateDefaultTab,
      updateShowTodayCashflow: vi.fn().mockResolvedValue({ ok: true }),
      resetDisplaySettings: vi.fn().mockResolvedValue({ ok: true }),
    } as any)

    renderSubject()

    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:display.todayCashflow",
      }),
    )

    await waitFor(() => {
      expect(updateDefaultTab).toHaveBeenCalledWith(DATA_TYPE_CASHFLOW)
    })
    expect(showUpdateToast).toHaveBeenCalledWith(
      writeResult,
      "settings:display.defaultTab",
    )
  })
})
