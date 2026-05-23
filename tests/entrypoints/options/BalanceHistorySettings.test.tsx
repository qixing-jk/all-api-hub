import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import BalanceHistorySettings from "~/features/BasicSettings/components/tabs/BalanceHistory/BalanceHistorySettings"
import { hasAlarmsAPI } from "~/utils/browser/browserApi"
import { fireEvent, render, screen, waitFor } from "~~/tests/test-utils/render"

vi.mock("~/contexts/UserPreferencesContext", async () => {
  const actual = await vi.importActual<
    typeof import("~/contexts/UserPreferencesContext")
  >("~/contexts/UserPreferencesContext")

  return {
    ...actual,
    useUserPreferencesContext: vi.fn(),
  }
})

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
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
    vi.unstubAllEnvs()
    vi.mocked(hasAlarmsAPI).mockReturnValue(true)
    ;(globalThis as any).browser = {
      ...(globalThis as any).browser,
      runtime: {
        ...((globalThis as any).browser?.runtime ?? {}),
        sendMessage: vi.fn(),
      },
    }
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
        estimatedTodayIncome: { enabled: false },
        retentionDays: 14,
      })
    })
  })

  it("saves estimated today income display preference", async () => {
    const updateBalanceHistory = vi.fn().mockResolvedValue(true)
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      preferences: {
        balanceHistory: {
          enabled: true,
          endOfDayCapture: { enabled: false },
          estimatedTodayIncome: { enabled: false },
          retentionDays: 30,
        },
      },
      updateBalanceHistory,
    } as any)

    renderSubject()

    fireEvent.click(
      await screen.findByRole("switch", {
        name: "balanceHistory:settings.estimatedTodayIncome",
      }),
    )
    fireEvent.click(
      await screen.findByText("balanceHistory:actions.applySettings"),
    )

    await waitFor(() => {
      expect(updateBalanceHistory).toHaveBeenCalledWith({
        enabled: true,
        endOfDayCapture: { enabled: false },
        estimatedTodayIncome: { enabled: true },
        retentionDays: 30,
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

    expect(
      screen.getByRole("switch", {
        name: "balanceHistory:settings.endOfDayCapture",
      }),
    ).toBeDisabled()
    expect(
      screen.getByRole("switch", {
        name: "balanceHistory:settings.estimatedTodayIncome",
      }),
    ).not.toBeDisabled()
  })

  it("shows a development-only action to seed estimated-income snapshots", async () => {
    vi.stubEnv("MODE", "development")
    const sendMessage = vi
      .fn()
      .mockResolvedValue({ success: true, data: { seeded: 2, skipped: 1 } })
    ;(globalThis as any).browser.runtime.sendMessage = sendMessage
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      preferences: {
        balanceHistory: {
          enabled: true,
          endOfDayCapture: { enabled: false },
          estimatedTodayIncome: { enabled: true },
          retentionDays: 30,
        },
      },
      updateBalanceHistory: vi.fn().mockResolvedValue(true),
    } as any)

    renderSubject()

    fireEvent.click(await screen.findByText("Dev: Seed estimate snapshots"))

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({
        action: RuntimeActionIds.BalanceHistoryDebugSeedEstimateSnapshots,
      })
    })
  })

  it("hides the estimated-income snapshot seed action outside development mode", () => {
    vi.stubEnv("MODE", "production")
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      preferences: {
        balanceHistory: {
          enabled: true,
          endOfDayCapture: { enabled: false },
          estimatedTodayIncome: { enabled: true },
          retentionDays: 30,
        },
      },
      updateBalanceHistory: vi.fn().mockResolvedValue(true),
    } as any)

    renderSubject()

    expect(
      screen.queryByText("Dev: Seed estimate snapshots"),
    ).not.toBeInTheDocument()
  })
})
