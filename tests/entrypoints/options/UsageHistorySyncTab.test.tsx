import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import UsageHistorySyncTab from "~/entrypoints/options/pages/BasicSettings/components/UsageHistorySyncTab"
import { accountStorage } from "~/services/accountStorage"
import { usageHistoryStorage } from "~/services/usageHistory/storage"
import { render } from "~/tests/test-utils/render"
import { sendRuntimeMessage } from "~/utils/browserApi"

vi.mock("~/contexts/UserPreferencesContext", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/contexts/UserPreferencesContext")>()
  return {
    ...actual,
    useUserPreferencesContext: vi.fn(),
  }
})

vi.mock("~/services/accountStorage", () => ({
  accountStorage: { getAllAccounts: vi.fn(), getEnabledAccounts: vi.fn() },
}))

vi.mock("~/services/usageHistory/storage", () => ({
  usageHistoryStorage: { getStore: vi.fn() },
}))

vi.mock("~/utils/browserApi", () => ({
  hasAlarmsAPI: vi.fn(() => true),
  sendRuntimeMessage: vi.fn(),
}))

vi.mock("react-hot-toast", () => ({
  default: {
    dismiss: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
    success: vi.fn(),
  },
}))

describe("UsageHistorySyncTab", () => {
  const renderSubject = () => render(<UsageHistorySyncTab />)

  it("sends usageHistory:updateSettings with current form values", async () => {
    const loadPreferences = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      preferences: {
        usageHistory: {
          enabled: true,
          retentionDays: 14,
          scheduleMode: "afterRefresh",
          syncIntervalMinutes: 180,
        },
      },
      loadPreferences,
    } as any)

    vi.mocked(accountStorage.getEnabledAccounts).mockResolvedValue([
      { id: "a1", site_name: "Account 1" },
    ] as any)
    vi.mocked(usageHistoryStorage.getStore).mockResolvedValue({
      schemaVersion: 2,
      accounts: {},
    } as any)

    vi.mocked(sendRuntimeMessage).mockResolvedValue({ success: true } as any)

    renderSubject()

    const applyButton = await screen.findByText(
      "usageAnalytics:actions.applySettings",
    )
    fireEvent.click(applyButton)

    await waitFor(() => {
      expect(sendRuntimeMessage).toHaveBeenCalledWith({
        action: RuntimeActionIds.UsageHistoryUpdateSettings,
        settings: {
          enabled: true,
          retentionDays: 14,
          scheduleMode: "afterRefresh",
          syncIntervalMinutes: 180,
        },
      })
    })

    await waitFor(() => {
      expect(loadPreferences).toHaveBeenCalled()
    })
  })

  it("syncs selected accounts via usageHistory:syncNow with accountIds", async () => {
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      preferences: {
        usageHistory: {
          enabled: true,
          retentionDays: 30,
          scheduleMode: "afterRefresh",
          syncIntervalMinutes: 360,
        },
      },
      loadPreferences: vi.fn().mockResolvedValue(undefined),
    } as any)

    vi.mocked(accountStorage.getEnabledAccounts).mockResolvedValue([
      { id: "a1", site_name: "Account 1" },
      { id: "a2", site_name: "Account 2" },
    ] as any)
    vi.mocked(usageHistoryStorage.getStore).mockResolvedValue({
      schemaVersion: 2,
      accounts: {
        a1: { status: { state: "never" } },
        a2: { status: { state: "never" } },
      },
    } as any)

    vi.mocked(sendRuntimeMessage).mockResolvedValue({
      success: true,
      data: { totals: { success: 1, skipped: 0, error: 0, unsupported: 0 } },
    } as any)

    renderSubject()

    const syncSelectedButton = await screen.findByText(
      "usageAnalytics:syncTab.actions.syncSelected",
    )
    expect(syncSelectedButton).toBeDisabled()

    const account1Cell = await screen.findByText("Account 1")
    const account1Row = account1Cell.closest("tr")
    if (!account1Row) throw new Error("Missing account row for Account 1")

    const account1Checkbox = within(account1Row).getByRole("checkbox")
    fireEvent.click(account1Checkbox)

    await waitFor(() => {
      expect(syncSelectedButton).not.toBeDisabled()
    })

    fireEvent.click(syncSelectedButton)

    await waitFor(() => {
      expect(sendRuntimeMessage).toHaveBeenCalledWith({
        action: RuntimeActionIds.UsageHistorySyncNow,
        accountIds: ["a1"],
      })
    })
  })
})
