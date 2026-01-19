import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import { describe, expect, it, vi } from "vitest"

import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import UsageHistorySyncTab from "~/entrypoints/options/pages/BasicSettings/components/UsageHistorySyncTab"
import commonEn from "~/locales/en/common.json"
import settingsEn from "~/locales/en/settings.json"
import usageAnalyticsEn from "~/locales/en/usageAnalytics.json"
import { accountStorage } from "~/services/accountStorage"
import { usageHistoryStorage } from "~/services/usageHistory/storage"
import { testI18n } from "~/tests/test-utils/i18n"
import { sendRuntimeMessage } from "~/utils/browserApi"

vi.mock("~/contexts/UserPreferencesContext", () => ({
  useUserPreferencesContext: vi.fn(),
}))

vi.mock("~/services/accountStorage", () => ({
  accountStorage: { getAllAccounts: vi.fn() },
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
  testI18n.addResourceBundle(
    "en",
    "usageAnalytics",
    usageAnalyticsEn,
    true,
    true,
  )
  testI18n.addResourceBundle("en", "settings", settingsEn, true, true)
  testI18n.addResourceBundle("en", "common", commonEn, true, true)

  const renderSubject = () =>
    render(
      <I18nextProvider i18n={testI18n}>
        <UsageHistorySyncTab />
      </I18nextProvider>,
    )

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

    vi.mocked(accountStorage.getAllAccounts).mockResolvedValue([
      { id: "a1", site_name: "Account 1" },
    ] as any)
    vi.mocked(usageHistoryStorage.getStore).mockResolvedValue({
      schemaVersion: 2,
      accounts: {},
    } as any)

    vi.mocked(sendRuntimeMessage).mockResolvedValue({ success: true } as any)

    renderSubject()

    const applyButton = await screen.findByText("Apply settings")
    fireEvent.click(applyButton)

    await waitFor(() => {
      expect(sendRuntimeMessage).toHaveBeenCalledWith({
        action: "usageHistory:updateSettings",
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

    vi.mocked(accountStorage.getAllAccounts).mockResolvedValue([
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

    const syncSelectedButton = await screen.findByText("Sync selected")
    expect(syncSelectedButton).toBeDisabled()

    const account1Checkbox = await screen.findByLabelText(
      "Select account: Account 1",
    )
    fireEvent.click(account1Checkbox)

    await waitFor(() => {
      expect(syncSelectedButton).not.toBeDisabled()
    })

    fireEvent.click(syncSelectedButton)

    await waitFor(() => {
      expect(sendRuntimeMessage).toHaveBeenCalledWith({
        action: "usageHistory:syncNow",
        accountIds: ["a1"],
      })
    })
  })
})
