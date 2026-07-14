import { fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import UsageHistorySyncRowActions from "~/features/BasicSettings/components/tabs/UsageHistorySync/UsageHistorySyncRowActions"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

const createDeferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise
  })

  return { promise, resolve }
}

describe("UsageHistorySyncRowActions", () => {
  it("keeps an externally syncing row locked without announcing local work", () => {
    render(
      <UsageHistorySyncRowActions
        accountId="account-1"
        isSyncing={true}
        onSync={vi.fn()}
      />,
      {
        withUserPreferencesProvider: false,
        withThemeProvider: false,
      },
    )

    const trigger = screen.getByRole("button", {
      name: "usageAnalytics:syncTab.table.rowActions",
    })
    expect(trigger).toBeDisabled()
    expect(trigger).not.toHaveAttribute("aria-busy")
  })

  it("marks only locally initiated sync as busy and suppresses duplicate syncs", async () => {
    const deferredSync = createDeferred()
    const onSync = vi.fn(() => deferredSync.promise)
    const user = userEvent.setup()

    render(
      <UsageHistorySyncRowActions
        accountId="account-1"
        isSyncing={false}
        onSync={onSync}
      />,
      {
        withUserPreferencesProvider: false,
        withThemeProvider: false,
      },
    )

    const trigger = screen.getByRole("button", {
      name: "usageAnalytics:syncTab.table.rowActions",
    })
    await user.click(trigger)
    const syncItem = screen.getByRole("menuitem", {
      name: "usageAnalytics:syncTab.actions.syncAccount",
    })
    fireEvent.click(syncItem)
    fireEvent.click(syncItem)

    expect(onSync).toHaveBeenCalledTimes(1)
    expect(trigger).toBeDisabled()
    expect(trigger).toHaveAttribute("aria-busy", "true")
    expect(trigger).toHaveAccessibleName(
      "usageAnalytics:syncTab.table.rowActions",
    )

    deferredSync.resolve()

    await waitFor(() => {
      expect(trigger).toBeEnabled()
    })
    expect(trigger).not.toHaveAttribute("aria-busy")
  })
})
