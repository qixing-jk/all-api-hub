import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { AccountSummaryBar } from "~/features/ModelList/components/AccountSummaryBar"
import { MODEL_LIST_ACCOUNT_ERROR_TYPES } from "~/features/ModelList/modelDataStates"

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>()

  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
    }),
  }
})

describe("AccountSummaryBar", () => {
  it("renders multiple active account badges and forwards click ids", async () => {
    const user = userEvent.setup()
    const onAccountClick = vi.fn()

    render(
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
          {
            accountId: "account-3",
            name: "Dormant Account",
            count: 5,
          },
        ]}
        activeAccountIds={["account-1", "account-2"]}
        onAccountClick={onAccountClick}
      />,
    )

    const primaryBadge = screen.getByRole("button", {
      name: /^Primary Account\s*accountSummary\.models$/,
      pressed: true,
    })
    expect(
      screen.getByRole("button", {
        name: /^Backup Account\s*accountSummary\.models$/,
        pressed: true,
      }),
    ).toBeVisible()
    expect(
      screen.getByRole("button", {
        name: /^Dormant Account\s*accountSummary\.models$/,
        pressed: false,
      }),
    ).toBeVisible()

    await user.click(primaryBadge)

    expect(onAccountClick).toHaveBeenCalledWith("account-1")
    expect(onAccountClick).toHaveBeenCalledTimes(1)
  })

  it("shows a loading label instead of a zero-model count while an account is still loading", () => {
    render(
      <AccountSummaryBar
        items={[
          {
            accountId: "account-loading",
            name: "Loading Account",
            count: 0,
            isLoading: true,
          },
        ]}
      />,
    )

    expect(screen.getByText("Loading Account")).toBeInTheDocument()
    expect(screen.getByText("accountSummary.loading")).toHaveClass(
      "text-amber-600",
      "dark:text-amber-300",
    )
    expect(screen.queryByText("accountSummary.models")).toBeNull()
  })

  it("shows only the error label when an account load fails", () => {
    render(
      <AccountSummaryBar
        items={[
          {
            accountId: "account-error",
            name: "Broken Account",
            count: 0,
            errorType: MODEL_LIST_ACCOUNT_ERROR_TYPES.LOAD_FAILED,
          },
        ]}
      />,
    )

    expect(screen.getByText("Broken Account")).toBeInTheDocument()
    expect(screen.getByText("accountSummary.loadFailed")).toHaveClass(
      "text-red-500",
      "dark:text-red-400",
    )
    expect(screen.queryByText("accountSummary.models")).toBeNull()
  })

  it("shows a warning summary with the failure reason when an account partially loads", () => {
    render(
      <AccountSummaryBar
        items={[
          {
            accountId: "account-partial",
            name: "Partial Account",
            count: 2,
            errorType: MODEL_LIST_ACCOUNT_ERROR_TYPES.PARTIAL_LOAD_FAILED,
            errorMessage: "Some keys failed to load. First failure: denied",
          },
        ]}
      />,
    )

    const partialBadge = screen.getByRole("button", {
      name: /^Partial Account/,
    })

    expect(partialBadge).toHaveAttribute(
      "title",
      "Some keys failed to load. First failure: denied",
    )
    expect(partialBadge).toHaveAccessibleName(
      "Partial Account accountSummary.partialLoadFailed Some keys failed to load. First failure: denied",
    )
    expect(screen.getByText("accountSummary.partialLoadFailed")).toHaveClass(
      "text-amber-600",
      "dark:text-amber-300",
    )
  })

  it("shows unsupported accounts as informational instead of failed", () => {
    render(
      <AccountSummaryBar
        items={[
          {
            accountId: "account-unsupported",
            name: "Unsupported Account",
            count: 0,
            errorType: MODEL_LIST_ACCOUNT_ERROR_TYPES.UNSUPPORTED_SOURCE,
            errorMessage: "Model list is not implemented yet.",
          },
        ]}
      />,
    )

    const unsupportedBadge = screen.getByRole("button", {
      name: /^Unsupported Account/,
    })

    expect(unsupportedBadge).toHaveAttribute(
      "title",
      "Model list is not implemented yet.",
    )
    expect(screen.getByText("accountSummary.unsupported")).toHaveClass(
      "text-blue-600",
      "dark:text-blue-300",
    )
    expect(screen.queryByText("accountSummary.loadFailed")).toBeNull()
  })
  it("folds settled failures while another account is loading and exposes details on demand", async () => {
    const user = userEvent.setup()
    render(
      <AccountSummaryBar
        items={[
          {
            accountId: "slow",
            name: "Slow",
            count: 0,
            hasData: false,
            isLoading: true,
          },
          {
            accountId: "failed",
            name: "Failed",
            count: 0,
            hasData: false,
            errorType: MODEL_LIST_ACCOUNT_ERROR_TYPES.LOAD_FAILED,
            errorMessage: "Denied",
          },
        ]}
      />,
    )
    expect(screen.getByText("Slow")).toBeVisible()
    expect(screen.queryByText("Failed")).not.toBeInTheDocument()
    const toggle = screen.getByRole("button", {
      name: "accountSummary.unavailableAccounts",
    })
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    await user.click(toggle)
    expect(screen.getByText("Failed")).toBeVisible()
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    await user.click(toggle)
    expect(screen.queryByText("Failed")).not.toBeInTheDocument()
  })

  it("keeps cached, partial, selected and filtered-zero accounts visible", () => {
    render(
      <AccountSummaryBar
        activeAccountIds={["selected"]}
        items={[
          {
            accountId: "cached",
            name: "Cached",
            count: 0,
            hasData: true,
            errorType: MODEL_LIST_ACCOUNT_ERROR_TYPES.LOAD_FAILED,
          },
          {
            accountId: "partial",
            name: "Partial",
            count: 0,
            hasData: true,
            errorType: MODEL_LIST_ACCOUNT_ERROR_TYPES.PARTIAL_LOAD_FAILED,
          },
          {
            accountId: "selected",
            name: "Selected",
            count: 0,
            hasData: false,
            errorType: MODEL_LIST_ACCOUNT_ERROR_TYPES.LOAD_FAILED,
          },
          { accountId: "filtered", name: "Filtered", count: 0, hasData: true },
          {
            accountId: "unsupported",
            name: "Unsupported",
            count: 0,
            hasData: false,
            errorType: MODEL_LIST_ACCOUNT_ERROR_TYPES.UNSUPPORTED_SOURCE,
          },
          {
            accountId: "invalid",
            name: "Invalid",
            count: 0,
            hasData: false,
            errorType: MODEL_LIST_ACCOUNT_ERROR_TYPES.INVALID_FORMAT,
          },
        ]}
      />,
    )
    for (const name of ["Cached", "Partial", "Selected", "Filtered"]) {
      expect(screen.getByText(name)).toBeVisible()
    }
    expect(screen.queryByText("Unsupported")).not.toBeInTheDocument()
    expect(screen.queryByText("Invalid")).not.toBeInTheDocument()
  })

  it("reveals all failures when no account has data or is loading", () => {
    render(
      <AccountSummaryBar
        items={[
          {
            accountId: "a",
            name: "Failed",
            count: 0,
            hasData: false,
            errorType: MODEL_LIST_ACCOUNT_ERROR_TYPES.LOAD_FAILED,
          },
          {
            accountId: "b",
            name: "Unsupported",
            count: 0,
            hasData: false,
            errorType: MODEL_LIST_ACCOUNT_ERROR_TYPES.UNSUPPORTED_SOURCE,
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
    ).not.toBeInTheDocument()
  })

  it("returns a retrying and recovered account to its original position", () => {
    const failed = {
      accountId: "a",
      name: "First",
      count: 0,
      hasData: false,
      errorType: MODEL_LIST_ACCOUNT_ERROR_TYPES.LOAD_FAILED,
    }
    const ready = { accountId: "b", name: "Second", count: 2, hasData: true }
    const { rerender } = render(<AccountSummaryBar items={[failed, ready]} />)
    expect(screen.queryByText("First")).not.toBeInTheDocument()
    rerender(
      <AccountSummaryBar items={[{ ...failed, isLoading: true }, ready]} />,
    )
    expect(screen.getByText("First")).toBeVisible()
    rerender(
      <AccountSummaryBar
        items={[
          { ...failed, hasData: true, errorType: undefined, count: 1 },
          ready,
        ]}
      />,
    )
    const accountButtons = screen.getAllByRole("button")
    expect(accountButtons).toHaveLength(2)
    expect(accountButtons[0]).toHaveAccessibleName(
      /^First\s*accountSummary\.models$/,
    )
    expect(accountButtons[1]).toHaveAccessibleName(
      /^Second\s*accountSummary\.models$/,
    )
    expect(
      screen.queryByRole("button", {
        name: "accountSummary.unavailableAccounts",
      }),
    ).not.toBeInTheDocument()
  })
})
