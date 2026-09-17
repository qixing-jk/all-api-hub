import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { AccountSummaryBar } from "~/features/KeyManagement/components/AccountSummaryBar"

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>()

  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
    }),
  }
})

describe("KeyManagement AccountSummaryBar", () => {
  it("waits for active account loads before enabling failed-account retry", () => {
    const { rerender } = render(
      <AccountSummaryBar
        items={[{ accountId: "failed", name: "Failed", count: null }]}
        failedAccounts={[{ accountId: "failed", accountName: "Failed" }]}
        tokenLoadProgress={{ total: 2, loaded: 0, loading: 1, error: 1 }}
        onRetryFailedAccounts={vi.fn()}
      />,
    )
    expect(
      screen.getByRole("button", { name: "actions.retryFailed" }),
    ).toBeDisabled()
    rerender(
      <AccountSummaryBar
        items={[{ accountId: "failed", name: "Failed", count: null }]}
        failedAccounts={[{ accountId: "failed", accountName: "Failed" }]}
        tokenLoadProgress={{ total: 2, loaded: 1, loading: 0, error: 1 }}
        onRetryFailedAccounts={vi.fn()}
      />,
    )
    expect(
      screen.getByRole("button", { name: "actions.retryFailed" }),
    ).toBeEnabled()
  })

  it("folds only settled unavailable accounts and keeps filtering separate from retry", async () => {
    const user = userEvent.setup()
    const onAccountClick = vi.fn()
    const onRetryFailedAccounts = vi.fn()
    render(
      <AccountSummaryBar
        onAccountClick={onAccountClick}
        onRetryFailedAccounts={onRetryFailedAccounts}
        failedAccounts={[{ accountId: "failed", accountName: "Failed" }]}
        activeAccountIds={["selected"]}
        items={[
          {
            accountId: "empty",
            name: "Empty success",
            count: 0,
            hasData: false,
          },
          {
            accountId: "failed",
            name: "Failed",
            count: null,
            hasData: false,
            errorType: "load-failed",
          },
          {
            accountId: "unsupported",
            name: "Unsupported",
            count: null,
            hasData: false,
            errorType: "unsupported",
          },
          {
            accountId: "selected",
            name: "Selected failure",
            count: null,
            hasData: false,
            errorType: "load-failed",
          },
          {
            accountId: "pending",
            name: "Pending retry",
            count: null,
            hasData: false,
            isLoading: true,
            errorType: "load-failed",
          },
          {
            accountId: "partial",
            name: "Filtered partial",
            count: null,
            knownCount: 0,
            hasData: true,
            errorType: "load-failed",
          },
        ]}
      />,
    )
    expect(screen.queryByText("Failed")).toBeNull()
    expect(screen.queryByText("Unsupported")).toBeNull()
    for (const name of [
      "Empty success",
      "Selected failure",
      "Pending retry",
      "Filtered partial",
    ])
      expect(screen.getByText(name)).toBeVisible()
    const toggle = screen.getByRole("button", {
      name: "accountSummary.unavailableAccounts",
    })
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    await user.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    await user.click(
      screen.getByRole("button", { name: /^Failed.*accountSummary/ }),
    )
    expect(onAccountClick).toHaveBeenCalledWith("failed")
    expect(onRetryFailedAccounts).not.toHaveBeenCalled()
    await user.click(
      screen.getByRole("button", { name: "actions.retryFailed" }),
    )
    expect(onRetryFailedAccounts).toHaveBeenCalledTimes(1)
    await user.click(toggle)
    expect(screen.queryByText("Failed")).toBeNull()
  })

  it("keeps every account visible when all accounts are unavailable", () => {
    render(
      <AccountSummaryBar
        items={[
          {
            accountId: "failed",
            name: "Failed",
            count: null,
            hasData: false,
            errorType: "load-failed",
          },
          {
            accountId: "unsupported",
            name: "Unsupported",
            count: null,
            hasData: false,
            errorType: "unsupported",
          },
        ]}
      />,
    )
    expect(screen.getByText("Failed")).toBeVisible()
    expect(screen.getByText("Unsupported")).toBeVisible()
    expect(
      screen.queryByRole("button", {
        name: "accountSummary.unavailableAccounts",
      }),
    ).toBeNull()
  })

  it("does not fold successful accounts and shows ongoing progress in the summary", () => {
    render(
      <AccountSummaryBar
        tokenLoadProgress={{ total: 31, loaded: 30, loading: 1, error: 0 }}
        items={Array.from({ length: 30 }, (_, index) => ({
          accountId: String(index),
          name: `Account ${index}`,
          count: 1,
          hasData: true,
        }))}
      />,
    )
    expect(screen.getAllByText(/^Account \d+$/)).toHaveLength(30)
    expect(screen.getByText(/allAccountsProgress/)).toBeVisible()
    expect(
      screen.queryByRole("button", {
        name: "accountSummary.unavailableAccounts",
      }),
    ).toBeNull()
  })
  it("labels pending accounts and distinguishes usable partial results from empty failures", () => {
    render(
      <AccountSummaryBar
        items={[
          {
            accountId: "loading",
            name: "Pending",
            count: null,
            isLoading: true,
          },
          {
            accountId: "partial",
            name: "Partial",
            count: null,
            knownCount: 2,
            hasData: true,
            errorType: "load-failed",
            errorMessage: "Permission denied",
          },
        ]}
      />,
    )
    expect(screen.getByText("accountSummary.loading")).toBeVisible()
    expect(screen.getByText("accountSummary.partialLoadFailed")).toBeVisible()
    expect(screen.getByText("knownTotalKeys")).toBeVisible()
    expect(
      screen.getByText("Partial").closest('[data-slot="badge"]'),
    ).toHaveAttribute("title", "Permission denied")
  })
  it("renders and updates account filter chip active styling", async () => {
    const user = userEvent.setup()
    const onAccountClick = vi.fn()

    const { rerender } = render(
      <AccountSummaryBar
        items={[
          {
            accountId: "account-1",
            name: "Primary Account",
            count: 2,
          },
          {
            accountId: "account-2",
            name: "Backup Account",
            count: 1,
          },
        ]}
        activeAccountIds={["account-1"]}
        onAccountClick={onAccountClick}
      />,
    )

    const primaryBadge = screen
      .getByText("Primary Account")
      .closest('[data-slot="badge"]')
    const backupBadge = screen
      .getByText("Backup Account")
      .closest('[data-slot="badge"]')

    expect(screen.queryByRole("checkbox")).toBeNull()
    expect(
      screen.queryByRole("button", { name: "accountSummary.selectAll" }),
    ).toBeNull()
    expect(
      screen.queryByRole("button", { name: "accountSummary.clearSelection" }),
    ).toBeNull()
    expect(primaryBadge).toHaveClass("bg-primary-soft")
    expect(backupBadge).toHaveClass("bg-secondary")
    expect(screen.getByRole("button", { name: /Primary Account/ })).toBe(
      primaryBadge,
    )
    expect(
      screen.getByRole("button", { name: /Primary Account/ }),
    ).toHaveAttribute("aria-pressed", "true")
    expect(
      screen.getByRole("button", { name: /Backup Account/ }),
    ).toHaveAttribute("aria-pressed", "false")

    await user.click(screen.getByText("Backup Account"))
    expect(onAccountClick).toHaveBeenCalledWith("account-2")
    expect(onAccountClick).toHaveBeenCalledTimes(1)

    screen.getByRole("button", { name: /Backup Account/ }).focus()
    await user.keyboard("{Enter}")
    expect(onAccountClick).toHaveBeenCalledWith("account-2")
    expect(onAccountClick).toHaveBeenCalledTimes(2)

    rerender(
      <AccountSummaryBar
        items={[
          {
            accountId: "account-1",
            name: "Primary Account",
            count: 2,
          },
          {
            accountId: "account-2",
            name: "Backup Account",
            count: 1,
          },
        ]}
        activeAccountIds={["account-2"]}
        onAccountClick={onAccountClick}
      />,
    )

    expect(
      screen.getByText("Primary Account").closest('[data-slot="badge"]'),
    ).toHaveClass("bg-secondary")
    expect(
      screen.getByText("Backup Account").closest('[data-slot="badge"]'),
    ).toHaveClass("bg-primary-soft")
  })

  it("renders passive error badges when no click handler is provided", () => {
    render(
      <AccountSummaryBar
        items={[
          {
            accountId: "account-1",
            name: "Standalone Account",
            count: 0,
            errorType: "load-failed",
          },
        ]}
      />,
    )

    const badge = screen
      .getByText("Standalone Account")
      .closest('[data-slot="badge"]')

    expect(badge).not.toHaveClass("cursor-pointer")
    expect(screen.getByText("accountSummary.loadFailed")).toBeInTheDocument()
  })

  it("renders visible combined counts without hiding a native partial failure", () => {
    render(
      <AccountSummaryBar
        items={[
          {
            accountId: "native-visible",
            name: "Visible native account",
            count: 1,
          },
          {
            accountId: "native-failed",
            name: "Failed native account",
            count: null,
            errorType: "load-failed",
          },
        ]}
      />,
    )

    expect(screen.getByText("Visible native account")).toBeVisible()
    expect(screen.getByText("Failed native account")).toBeVisible()
    expect(screen.getAllByText("accountSummary.keys")).toHaveLength(1)
    expect(screen.queryByText("accountSummary.keysUnavailable")).toBeNull()
    expect(screen.getByText("accountSummary.loadFailed")).toBeVisible()
  })

  it("does not report an unsupported inventory as zero keys", () => {
    render(
      <AccountSummaryBar
        items={[
          {
            accountId: "unsupported",
            name: "Unsupported account",
            count: 0,
            errorType: "unsupported",
          },
        ]}
      />,
    )

    expect(screen.getByText("accountSummary.unsupported")).toBeVisible()
    expect(screen.queryByText("accountSummary.keys")).toBeNull()
  })

  it("shows known rows as partial without presenting them as a complete count", () => {
    render(
      <AccountSummaryBar
        items={[
          {
            accountId: "partially-known",
            name: "Partially known account",
            count: null,
            knownCount: 2,
            errorType: "load-failed",
          },
        ]}
      />,
    )

    expect(screen.getByText("knownTotalKeys")).toBeVisible()
    expect(screen.queryByText("accountSummary.keys")).toBeNull()
  })

  it("preserves a known partial count of zero", () => {
    render(
      <AccountSummaryBar
        items={[
          {
            accountId: "empty-partial",
            name: "Empty partial account",
            count: null,
            knownCount: 0,
            errorType: "load-failed",
          },
        ]}
      />,
    )

    expect(screen.getByText("knownTotalKeys")).toBeVisible()
    expect(screen.getByText("accountSummary.loadFailed")).toBeVisible()
  })
})
