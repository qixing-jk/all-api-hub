import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DATA_TYPE_BALANCE, DATA_TYPE_CASHFLOW } from "~/constants"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import DisplaySettings from "~/features/BasicSettings/components/tabs/General/DisplaySettings"
import { showUpdateToast } from "~/utils/core/toastHelpers"
import { testI18n } from "~~/tests/test-utils/i18n"

vi.mock("~/contexts/UserPreferencesContext", () => ({
  useUserPreferencesContext: vi.fn(),
}))

vi.mock("~/utils/core/toastHelpers", () => ({
  showUpdateToast: vi.fn(),
}))

describe("DisplaySettings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      activeTab: DATA_TYPE_BALANCE,
      currencyType: "USD",
      showTodayCashflow: true,
      updateCurrencyType: vi.fn().mockResolvedValue({ ok: true }),
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

  it("shows result-aware feedback after changing the currency", async () => {
    const writeResult = { ok: true as const }
    const updateCurrencyType = vi.fn().mockResolvedValue(writeResult)
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      activeTab: DATA_TYPE_BALANCE,
      currencyType: "USD",
      showTodayCashflow: true,
      updateCurrencyType,
      updateDefaultTab: vi.fn().mockResolvedValue({ ok: true }),
      updateShowTodayCashflow: vi.fn().mockResolvedValue({ ok: true }),
      resetDisplaySettings: vi.fn().mockResolvedValue({ ok: true }),
    } as any)

    renderSubject()

    fireEvent.click(
      screen.getByRole("button", { name: "settings:display.cny" }),
    )

    await waitFor(() => {
      expect(updateCurrencyType).toHaveBeenCalledWith("CNY")
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
      currencyType: "USD",
      showTodayCashflow: false,
      updateCurrencyType: vi.fn().mockResolvedValue({ ok: true }),
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
      currencyType: "USD",
      showTodayCashflow: true,
      updateCurrencyType: vi.fn().mockResolvedValue({ ok: true }),
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
