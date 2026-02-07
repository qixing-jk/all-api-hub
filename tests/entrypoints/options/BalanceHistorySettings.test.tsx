import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import BalanceHistorySettings from "~/entrypoints/options/pages/BasicSettings/components/BalanceHistorySettings"
import balanceHistoryEn from "~/locales/en/balanceHistory.json"
import commonEn from "~/locales/en/common.json"
import settingsEn from "~/locales/en/settings.json"
import { testI18n } from "~/tests/test-utils/i18n"
import { hasAlarmsAPI } from "~/utils/browserApi"

vi.mock("~/contexts/UserPreferencesContext", () => ({
  useUserPreferencesContext: vi.fn(),
}))

vi.mock("~/utils/browserApi", () => ({
  hasAlarmsAPI: vi.fn(() => true),
}))

vi.mock("react-hot-toast", () => {
  const toast = Object.assign(vi.fn(), {
    dismiss: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(() => "toast-id"),
    success: vi.fn(),
  })
  return { default: toast }
})

describe("BalanceHistorySettings", () => {
  testI18n.addResourceBundle("en", "balanceHistory", balanceHistoryEn, true, true)
  testI18n.addResourceBundle("en", "settings", settingsEn, true, true)
  testI18n.addResourceBundle("en", "common", commonEn, true, true)

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(hasAlarmsAPI).mockReturnValue(true)
  })

  const renderSubject = () =>
    render(
      <I18nextProvider i18n={testI18n}>
        <BalanceHistorySettings />
      </I18nextProvider>,
    )

  it("sends balanceHistory:updateSettings with current form values", async () => {
    const updateBalanceHistory = vi.fn().mockResolvedValue(true)
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      preferences: {
        balanceHistory: {
          enabled: true,
          endOfDayCapture: { enabled: true },
          retentionDays: 14,
        },
      },
      updateBalanceHistory,
    } as any)

    renderSubject()

    fireEvent.click(await screen.findByText("Apply settings"))

    await waitFor(() => {
      expect(updateBalanceHistory).toHaveBeenCalledWith({
        enabled: true,
        endOfDayCapture: { enabled: true },
        retentionDays: 14,
      })
    })
  })

  it("disables end-of-day capture when alarms are unsupported", async () => {
    vi.mocked(hasAlarmsAPI).mockReturnValue(false)
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      preferences: {
        balanceHistory: {
          enabled: true,
          endOfDayCapture: { enabled: false },
          retentionDays: 30,
        },
      },
      updateBalanceHistory: vi.fn().mockResolvedValue(true),
    } as any)

    renderSubject()

    expect(
      await screen.findByText(
        "Alarms API is not available in this browser; end-of-day capture cannot be enabled.",
      ),
    ).toBeInTheDocument()

    const switches = screen.getAllByRole("switch")
    expect(switches).toHaveLength(2)
    expect(switches[1]).toBeDisabled()
  })
})

