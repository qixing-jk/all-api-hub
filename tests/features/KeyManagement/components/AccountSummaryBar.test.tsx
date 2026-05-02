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
    expect(primaryBadge).toHaveClass("bg-blue-100")
    expect(backupBadge).toHaveClass("bg-secondary")

    await user.click(screen.getByText("Backup Account"))
    expect(onAccountClick).toHaveBeenCalledWith("account-2")
    expect(onAccountClick).toHaveBeenCalledTimes(1)

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
    ).toHaveClass("bg-blue-100")
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
})
