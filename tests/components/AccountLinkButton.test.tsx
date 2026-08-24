import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import AccountLinkButton from "~/components/AccountLinkButton"

vi.mock("~/utils/navigation", () => ({
  openAccountManagerWithSearch: vi.fn(),
}))

describe("AccountLinkButton", () => {
  it("keeps a long account name discoverable while allowing constrained layouts", () => {
    const accountName =
      "A very long production account name that should not expand the results table"

    render(
      <AccountLinkButton
        accountId="account-1"
        accountName={accountName}
        className="w-full overflow-hidden"
      />,
    )

    const linkButton = screen.getByRole("button", {
      name: `View account ${accountName} in manager`,
    })

    expect(linkButton).toHaveAttribute("title", accountName)
    expect(linkButton).toHaveClass("max-w-full", "min-w-0", "w-full")
    expect(screen.getByText(accountName)).toHaveClass("truncate", "min-w-0")
  })
})
