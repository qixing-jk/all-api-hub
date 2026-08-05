import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { AccountSelectorPanel } from "~/features/KeyManagement/components/AccountSelectorPanel"
import { KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE } from "~/features/KeyManagement/constants"
import { render, screen } from "~~/tests/test-utils/render"
import { createAccount } from "~~/tests/utils/keyManagementFactories"

describe("KeyManagement AccountSelectorPanel retry failed", () => {
  it("renders retry failed accounts button and statistics in all-accounts mode", async () => {
    const user = userEvent.setup()
    const onRetryFailedAccounts = vi.fn()

    render(
      <AccountSelectorPanel
        selectedAccount={KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE}
        setSelectedAccount={vi.fn()}
        displayData={[createAccount({ id: "acc-a", name: "Account A" })] as any}
        tokens={[]}
        filteredTokens={[]}
        tokenLoadProgress={null}
        failedAccounts={[
          {
            accountId: "acc-a",
            accountName: "Account A",
            errorMessage: "boom",
          },
          {
            accountId: "acc-b",
            accountName: "Account B",
            errorMessage: "boom",
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

  it("renders known aggregate counts as partial when an included inventory is unknown", async () => {
    render(
      <AccountSelectorPanel
        selectedAccount={KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE}
        setSelectedAccount={vi.fn()}
        displayData={[createAccount({ id: "acc-a", name: "Account A" })] as any}
        tokens={[]}
        filteredTokens={[]}
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
      await screen.findByText(/keyManagement:totalKeysPartial/),
    ).toBeVisible()
    expect(screen.getByText(/keyManagement:enabledCountPartial/)).toBeVisible()
    expect(screen.getByText(/keyManagement:showingCountPartial/)).toBeVisible()
    expect(screen.queryByText(/keyManagement:totalKeys$/)).toBeNull()
  })

  it("renders aggregate counts as unavailable when no rows are known", async () => {
    render(
      <AccountSelectorPanel
        selectedAccount={KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE}
        setSelectedAccount={vi.fn()}
        displayData={[createAccount({ id: "acc-a", name: "Account A" })] as any}
        tokens={[]}
        filteredTokens={[]}
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

    expect(
      await screen.findByText(/keyManagement:totalKeysUnavailable/),
    ).toBeVisible()
    expect(
      screen.getByText(/keyManagement:enabledCountUnavailable/),
    ).toBeVisible()
    expect(
      screen.getByText(/keyManagement:showingCountUnavailable/),
    ).toBeVisible()
  })
})
