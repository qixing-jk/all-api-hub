import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"

import UsageHistorySyncSettingsSection from "~/features/BasicSettings/components/tabs/UsageHistorySync/UsageHistorySyncSettingsSection"
import { USAGE_HISTORY_SCHEDULE_MODE } from "~/types/usageHistory"
import { createDeferred } from "~~/tests/test-utils/deferred"
import { fireEvent, render, screen, waitFor } from "~~/tests/test-utils/render"

const noop = vi.fn()

describe("UsageHistorySyncSettingsSection", () => {
  it("allows reset to discard an invalid interval draft even when saved preferences are default", async () => {
    const user = userEvent.setup()
    const onReset = vi.fn().mockResolvedValue({ ok: true })
    render(
      <UsageHistorySyncSettingsSection
        reset={{
          onReset,
          resetDisabled: true,
          resetRequiresConfirmation: false,
        }}
        enabled={false}
        onEnabledChange={noop}
        retentionDays={30}
        onRetentionDaysChange={noop}
        scheduleMode={USAGE_HISTORY_SCHEDULE_MODE.AFTER_REFRESH}
        onScheduleModeChange={noop}
        syncIntervalMinutes={360}
        onSyncIntervalMinutesChange={noop}
        onSyncIntervalMinutesCommit={async () => false}
        alarmsSupported
        isLoading={false}
        isSyncingAll={false}
        onApplySettings={noop}
        onSyncNow={noop}
        onRefreshStatus={noop}
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )
    const interval = screen.getAllByRole("spinbutton")[1]
    await user.clear(interval)
    const reset = screen.getByRole("button", { name: "common:actions.reset" })
    expect(reset).toBeEnabled()
    await user.click(reset)
    expect(interval).toHaveValue(6)
    expect(onReset).toHaveBeenCalledOnce()
  })

  it("attaches the sync interval search target to the sync interval field", () => {
    const { container } = render(
      <UsageHistorySyncSettingsSection
        reset={{
          onReset: async () => ({ ok: true }),
          resetDisabled: true,
          resetRequiresConfirmation: false,
        }}
        enabled={true}
        onEnabledChange={noop}
        retentionDays={30}
        onRetentionDaysChange={noop}
        scheduleMode={USAGE_HISTORY_SCHEDULE_MODE.MANUAL}
        onScheduleModeChange={noop}
        syncIntervalMinutes={360}
        onSyncIntervalMinutesChange={noop}
        alarmsSupported={true}
        isLoading={false}
        isSyncingAll={false}
        onApplySettings={noop}
        onSyncNow={noop}
        onRefreshStatus={noop}
      />,
      {
        withUserPreferencesProvider: false,
        withThemeProvider: false,
      },
    )

    const intervalTarget = container.querySelector(
      "#usage-history-sync-interval-hours",
    )

    expect(intervalTarget).not.toBeNull()
    expect(intervalTarget).toHaveTextContent(
      "usageAnalytics:settings.syncIntervalHours",
    )
    expect(intervalTarget).not.toHaveTextContent(
      "usageAnalytics:settings.scheduleMode",
    )
  })

  it("marks only Sync Now busy, suppresses duplicate clicks, and restores after syncing", async () => {
    const deferredSync = createDeferred<void>()
    const onSyncNow = vi.fn(() => deferredSync.promise)

    function Subject() {
      const [isSyncingAll, setIsSyncingAll] = useState(false)

      const handleSyncNow = async () => {
        setIsSyncingAll(true)
        try {
          await onSyncNow()
        } finally {
          setIsSyncingAll(false)
        }
      }

      return (
        <UsageHistorySyncSettingsSection
          reset={{
            onReset: async () => ({ ok: true }),
            resetDisabled: true,
            resetRequiresConfirmation: false,
          }}
          enabled={true}
          onEnabledChange={noop}
          retentionDays={30}
          onRetentionDaysChange={noop}
          scheduleMode={USAGE_HISTORY_SCHEDULE_MODE.MANUAL}
          onScheduleModeChange={noop}
          syncIntervalMinutes={360}
          onSyncIntervalMinutesChange={noop}
          alarmsSupported={true}
          isLoading={false}
          isSyncingAll={isSyncingAll}
          onApplySettings={noop}
          onSyncNow={handleSyncNow}
          onRefreshStatus={noop}
        />
      )
    }

    render(<Subject />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    fireEvent.click(
      screen.getByRole("button", { name: "usageAnalytics:actions.syncNow" }),
    )

    const syncingButton = await screen.findByRole("button", {
      name: "usageAnalytics:messages.loading.syncing",
    })
    expect(syncingButton).toBeDisabled()
    expect(syncingButton).toHaveAttribute("aria-busy", "true")

    const refreshButton = screen.getByRole("button", {
      name: "usageAnalytics:syncTab.actions.refreshStatus",
    })
    expect(refreshButton).toBeDisabled()
    expect(refreshButton).not.toHaveAttribute("aria-busy")
    expect(
      screen.getByRole("button", {
        name: "usageAnalytics:actions.applySettings",
      }),
    ).not.toHaveAttribute("aria-busy")

    fireEvent.click(syncingButton)
    expect(onSyncNow).toHaveBeenCalledTimes(1)

    deferredSync.resolve()

    await waitFor(() => {
      const restoredButton = screen.getByRole("button", {
        name: "usageAnalytics:actions.syncNow",
      })
      expect(restoredButton).toBeEnabled()
      expect(restoredButton).not.toHaveAttribute("aria-busy")
    })
  })
})
