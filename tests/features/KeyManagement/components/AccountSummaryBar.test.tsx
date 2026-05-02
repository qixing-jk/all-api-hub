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
  it("renders account filter chips without selection controls", async () => {
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
        ]}
        activeAccountIds={["account-1"]}
        onAccountClick={onAccountClick}
      />,
    )

    expect(screen.queryByRole("checkbox")).toBeNull()
    expect(
      screen.queryByRole("button", { name: "accountSummary.selectAll" }),
    ).toBeNull()
    expect(
      screen.queryByRole("button", { name: "accountSummary.clearSelection" }),
    ).toBeNull()

    await user.click(screen.getByText("Backup Account"))
    expect(onAccountClick).toHaveBeenCalledWith("account-2")
    expect(onAccountClick).toHaveBeenCalledTimes(1)
  })
})
