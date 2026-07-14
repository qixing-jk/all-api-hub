import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import UsageHistorySyncStateTable from "~/features/BasicSettings/components/tabs/UsageHistorySync/UsageHistorySyncStateTable"
import { render, screen, within } from "~~/tests/test-utils/render"

const createDeferred = <T,>() => {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })

  return { promise, resolve }
}

describe("UsageHistorySyncStateTable", () => {
  it("locks selection controls without marking them busy while selected accounts sync", async () => {
    const user = userEvent.setup()
    const deferredSync = createDeferred<void>()
    const onSyncAccounts = vi.fn(() => deferredSync.promise)

    render(
      <UsageHistorySyncStateTable
        rows={[
          {
            id: "account-1",
            accountName: "Example Account 1",
            state: "never",
            lastSyncAtMs: null,
            lastSyncAtLabel: "Never",
          },
          {
            id: "account-2",
            accountName: "Example Account 2",
            state: "never",
            lastSyncAtMs: null,
            lastSyncAtLabel: "Never",
          },
        ]}
        isLoading={false}
        hasAnyAccounts={true}
        isSyncingAll={false}
        syncingAccountIds={new Set()}
        onSyncAccounts={onSyncAccounts}
      />,
      {
        withUserPreferencesProvider: false,
        withThemeProvider: false,
      },
    )

    const firstAccountRow = screen.getByRole("row", {
      name: /Example Account 1/,
    })

    await user.click(within(firstAccountRow).getByRole("checkbox"))
    const syncSelectedButton = screen.getByRole("button", {
      name: "usageAnalytics:syncTab.actions.syncSelected",
    })
    await user.click(syncSelectedButton)

    expect(onSyncAccounts).toHaveBeenCalledWith(["account-1"])
    expect(syncSelectedButton).toHaveAccessibleName(
      "usageAnalytics:syncTab.actions.syncing",
    )
    expect(syncSelectedButton).toBeDisabled()
    expect(syncSelectedButton).toHaveAttribute("aria-busy", "true")

    await user.click(syncSelectedButton)
    expect(onSyncAccounts).toHaveBeenCalledTimes(1)

    const clearSelectionButton = screen.getByRole("button", {
      name: "usageAnalytics:syncTab.actions.clearSelection",
    })
    expect(clearSelectionButton).toBeDisabled()
    expect(clearSelectionButton).not.toHaveAttribute("aria-busy")

    for (const checkbox of screen.getAllByRole("checkbox")) {
      expect(checkbox).toBeDisabled()
      expect(checkbox).not.toHaveAttribute("aria-busy")
    }

    deferredSync.resolve()

    const restoredSyncSelectedButton = await screen.findByRole("button", {
      name: "usageAnalytics:syncTab.actions.syncSelected",
    })
    expect(restoredSyncSelectedButton).toBeEnabled()
    expect(restoredSyncSelectedButton).not.toHaveAttribute("aria-busy")
    expect(clearSelectionButton).toBeEnabled()
  })
})
