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

    await user.click(primaryBadge!)

    expect(onAccountClick).toHaveBeenCalledWith("account-1")
    expect(onAccountClick).toHaveBeenCalledTimes(1)
  })
})
