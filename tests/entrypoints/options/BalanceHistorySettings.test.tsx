import { beforeEach, describe, expect, it, vi } from "vitest"

import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import BalanceHistorySettings from "~/entrypoints/options/pages/BasicSettings/components/tabs/BalanceHistory/BalanceHistorySettings"
import { fireEvent, render, screen, waitFor } from "~/tests/test-utils/render"
import { hasAlarmsAPI } from "~/utils/browserApi"

vi.mock("~/contexts/UserPreferencesContext", async () => {
  const actual = await vi.importActual<
    typeof import("~/contexts/UserPreferencesContext")
  >("~/contexts/UserPreferencesContext")

  return {
    ...actual,
    useUserPreferencesContext: vi.fn(),
  }
})

vi.mock("~/utils/browserApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/browserApi")>()
  return {
    ...actual,
    hasAlarmsAPI: vi.fn(() => true),
  }
})

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
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(hasAlarmsAPI).mockReturnValue(true)
  })

  const renderSubject = () => render(<BalanceHistorySettings />)

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

    fireEvent.click(
      await screen.findByText("balanceHistory:actions.applySettings"),
    )

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
      await screen.findByText("balanceHistory:settings.alarmUnsupported"),
    ).toBeInTheDocument()

    const switches = screen.getAllByRole("switch")
    expect(switches).toHaveLength(2)
    expect(switches[1]).toBeDisabled()
  })
})
