import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { AccountSelectorPanel } from "~/features/KeyManagement/components/AccountSelectorPanel"
import { AccountSummaryBar } from "~/features/KeyManagement/components/AccountSummaryBar"
import { KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE } from "~/features/KeyManagement/constants"
import { render, screen } from "~~/tests/test-utils/render"
import { createAccount } from "~~/tests/utils/keyManagementFactories"

describe("KeyManagement account selection and summary", () => {
  it("renders retry failed accounts button and statistics in all-accounts mode", async () => {
    const user = userEvent.setup()
    const onRetryFailedAccounts = vi.fn()

    render(
      <AccountSummaryBar
        items={[{ accountId: "acc-a", name: "Account A", count: null }]}
        tokenLoadProgress={null}
        failedAccounts={[
          {
            accountId: "acc-a",
            accountName: "Account A",
          },
          {
            accountId: "acc-b",
            accountName: "Account B",
          },
        ]}
        onRetryFailedAccounts={onRetryFailedAccounts}
      />,
    )

    expect(
      await screen.findByText(/keyManagement:allAccountsFailed/),
    ).toBeInTheDocument()

    const retryButton = await screen.findByRole("button", {
      name: "keyManagement:actions.retryFailed",
    })
    expect(retryButton).toBeInTheDocument()

    await user.click(retryButton)
    expect(onRetryFailedAccounts).toHaveBeenCalledTimes(1)
  })

  it("keeps the visible count exact while describing known inventory once", async () => {
    render(
      <AccountSelectorPanel
        selectedAccount={KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE}
        setSelectedAccount={vi.fn()}
        displayData={[createAccount({ id: "acc-a", name: "Account A" })] as any}
        aggregateCounts={{
          total: null,
          enabled: null,
          showing: null,
          knownTotal: 2,
          knownEnabled: 1,
          knownShowing: 1,
        }}
      />,
    )

    expect(
      await screen.findByText(/keyManagement:knownTotalKeys/),
    ).toBeVisible()
    expect(screen.getByText(/keyManagement:showingCount/)).toBeVisible()
    expect(screen.queryByText(/keyManagement:enabledCountPartial/)).toBeNull()
    expect(screen.queryByText(/keyManagement:showingCountPartial/)).toBeNull()
    expect(screen.queryByText(/keyManagement:totalKeys$/)).toBeNull()
  })

  it("omits unavailable inventory metrics when no rows are known", async () => {
    render(
      <AccountSelectorPanel
        selectedAccount={KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE}
        setSelectedAccount={vi.fn()}
        displayData={[createAccount({ id: "acc-a", name: "Account A" })] as any}
        aggregateCounts={{
          total: null,
          enabled: null,
          showing: null,
          knownTotal: 0,
          knownEnabled: 0,
          knownShowing: 0,
        }}
      />,
    )

    expect(await screen.findByText(/keyManagement:showingCount/)).toBeVisible()
    expect(screen.queryByText(/keyManagement:totalKeysUnavailable/)).toBeNull()
    expect(
      screen.queryByText(/keyManagement:enabledCountUnavailable/),
    ).toBeNull()
    expect(
      screen.queryByText(/keyManagement:showingCountUnavailable/),
    ).toBeNull()
  })

  it("shows account progress only while an account is still loading", async () => {
    const baseProps = {
      items: [{ accountId: "acc-a", name: "Account A", count: 1 }],
      failedAccounts: [
        {
          accountId: "acc-b",
          accountName: "Account B",
          errorMessage: "boom",
        },
      ],
    }
    const { unmount } = render(
      <AccountSummaryBar
        {...baseProps}
        tokenLoadProgress={{ total: 2, loaded: 1, loading: 0, error: 1 }}
      />,
    )

    await screen.findByText(/keyManagement:accountSummary.title/)
    expect(screen.queryByText(/keyManagement:allAccountsProgress/)).toBeNull()

    unmount()
    render(
      <AccountSummaryBar
        {...baseProps}
        tokenLoadProgress={{ total: 3, loaded: 1, loading: 1, error: 1 }}
      />,
    )

    expect(
      await screen.findByText(/keyManagement:allAccountsProgress/),
    ).toBeVisible()
  })
})
