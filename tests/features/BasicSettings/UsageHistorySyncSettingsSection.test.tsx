import { act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"

import UsageHistorySyncSettingsSection from "~/features/BasicSettings/components/tabs/UsageHistorySync/UsageHistorySyncSettingsSection"
import { USAGE_HISTORY_SCHEDULE_MODE } from "~/types/usageHistory"
import { createDeferred } from "~~/tests/test-utils/deferred"
import { atIndex } from "~~/tests/test-utils/indexedAccess"
import { fireEvent, render, screen, waitFor } from "~~/tests/test-utils/render"

const noop = vi.fn()

describe("UsageHistorySyncSettingsSection", () => {
  it.each([true, false])(
    "sequences Apply after the interval save result %s and permits retry after failure",
    async (saved) => {
      const user = userEvent.setup()
      const pending = createDeferred<boolean>()
      const apply = vi.fn()
      const commit = vi.fn<(value: number) => Promise<boolean>>(
        () => pending.promise,
      )
      function Subject() {
        const [saving, setSaving] = useState(false)
        return (
          <UsageHistorySyncSettingsSection
            reset={{
              onReset: async () => ({ ok: true }),
              resetDisabled: true,
              resetRequiresConfirmation: false,
            }}
            enabled
            onEnabledChange={noop}
            retentionDays={14}
            onRetentionDaysChange={noop}
            scheduleMode={USAGE_HISTORY_SCHEDULE_MODE.AFTER_REFRESH}
            onScheduleModeChange={noop}
            syncIntervalMinutes={360}
            onSyncIntervalMinutesChange={noop}
            onSyncIntervalMinutesCommit={async (value) => {
              setSaving(true)
              try {
                return await commit(value)
              } finally {
                setSaving(false)
              }
            }}
            isSavingSettings={saving}
            alarmsSupported
            isLoading={false}
            isSyncingAll={false}
            onApplySettings={apply}
            onSyncNow={noop}
            onRefreshStatus={noop}
          />
        )
      }
      render(<Subject />, {
        withUserPreferencesProvider: false,
        withThemeProvider: false,
      })
      const interval = atIndex(screen.getAllByRole("spinbutton"), 1)
      await user.clear(interval)
      await user.type(interval, "2")
      await user.click(
        screen.getByRole("button", {
          name: "usageAnalytics:actions.applySettings",
        }),
      )
      expect(commit).toHaveBeenCalledExactlyOnceWith(120)
      await act(async () => pending.resolve(saved))
      if (saved) {
        expect(apply).toHaveBeenCalledOnce()
        return
      }
      expect(apply).not.toHaveBeenCalled()
      expect(interval).toHaveValue(2)
      commit.mockResolvedValue(true)
      await user.click(
        screen.getByRole("button", {
          name: "usageAnalytics:actions.applySettings",
        }),
      )
      await waitFor(() => expect(apply).toHaveBeenCalledOnce())
      expect(commit).toHaveBeenCalledTimes(2)
    },
  )

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
    const interval = atIndex(screen.getAllByRole("spinbutton"), 1)
    await user.clear(interval)
    const reset = screen.getByRole("button", { name: "common:actions.reset" })
    expect(reset).toBeEnabled()
    await user.click(reset)
    expect(interval).toHaveValue(6)
    expect(onReset).toHaveBeenCalledOnce()
  })

  it("preserves a stored fractional-hour interval when focused and blurred without edits", async () => {
    const user = userEvent.setup()
    const commit = vi.fn()
    render(
      <UsageHistorySyncSettingsSection
        reset={{
          onReset: async () => ({ ok: true }),
          resetDisabled: false,
          resetRequiresConfirmation: false,
        }}
        enabled
        onEnabledChange={noop}
        retentionDays={14}
        onRetentionDaysChange={noop}
        scheduleMode={USAGE_HISTORY_SCHEDULE_MODE.AFTER_REFRESH}
        onScheduleModeChange={noop}
        syncIntervalMinutes={90}
        onSyncIntervalMinutesChange={noop}
        onSyncIntervalMinutesCommit={commit}
        alarmsSupported
        isLoading={false}
        isSyncingAll={false}
        onApplySettings={noop}
        onSyncNow={noop}
        onRefreshStatus={noop}
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )
    await user.click(atIndex(screen.getAllByRole("spinbutton"), 1))
    await user.click(screen.getByText("usageAnalytics:syncTab.settingsTitle"))
    expect(commit).not.toHaveBeenCalled()
  })

  it("saves an interval draft when keyboard focus leaves Apply without applying retention", async () => {
    const user = userEvent.setup()
    const commit = vi.fn()
    render(
      <UsageHistorySyncSettingsSection
        reset={{
          onReset: async () => ({ ok: true }),
          resetDisabled: false,
          resetRequiresConfirmation: false,
        }}
        enabled
        onEnabledChange={noop}
        retentionDays={14}
        onRetentionDaysChange={noop}
        scheduleMode={USAGE_HISTORY_SCHEDULE_MODE.AFTER_REFRESH}
        onScheduleModeChange={noop}
        syncIntervalMinutes={360}
        onSyncIntervalMinutesChange={noop}
        onSyncIntervalMinutesCommit={commit}
        alarmsSupported
        isLoading={false}
        isSyncingAll={false}
        onApplySettings={noop}
        onSyncNow={noop}
        onRefreshStatus={noop}
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )
    await user.clear(atIndex(screen.getAllByRole("spinbutton"), 1))
    await user.type(atIndex(screen.getAllByRole("spinbutton"), 1), "2")
    await user.tab()
    await user.click(screen.getByText("usageAnalytics:syncTab.settingsTitle"))
    expect(commit).toHaveBeenCalledExactlyOnceWith(120)
  })

  it("keeps the legacy interval callback and search target attached to the interval field", () => {
    const change = vi.fn()
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
        onSyncIntervalMinutesChange={change}
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

    fireEvent.change(atIndex(screen.getAllByRole("spinbutton"), 1), {
      target: { value: "2" },
    })
    expect(change).toHaveBeenCalledExactlyOnceWith(120)
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
