import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { AccountSummaryBar } from "~/features/ModelList/components/AccountSummaryBar"

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

    const primaryBadge = screen
      .getByText("Primary Account")
      .closest("[data-slot='badge']")
    const backupBadge = screen
      .getByText("Backup Account")
      .closest("[data-slot='badge']")
    const dormantBadge = screen
      .getByText("Dormant Account")
      .closest("[data-slot='badge']")

    expect(primaryBadge).toHaveClass("bg-blue-100", "text-blue-700")
    expect(backupBadge).toHaveClass("bg-blue-100", "text-blue-700")
    expect(dormantBadge).toHaveClass("bg-secondary")
    expect(screen.getAllByText("accountSummary.models")[0]).toHaveClass(
      "text-emerald-600",
      "dark:text-emerald-400",
    )

    await user.click(primaryBadge!)

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
            errorType: "load-failed",
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
            errorType: "partial-load-failed",
            errorMessage: "Some keys failed to load. First failure: denied",
          },
        ]}
      />,
    )

    const partialBadge = screen
      .getByText("Partial Account")
      .closest("[data-slot='badge']")

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
})
