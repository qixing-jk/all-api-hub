import { describe, expect, it, vi } from "vitest"

import { TokenDetails } from "~/features/KeyManagement/components/TokenListItem/TokenDetails"
import { render, screen } from "~~/tests/test-utils/render"
import { createToken } from "~~/tests/utils/keyManagementFactories"

vi.mock("~/features/KeyManagement/utils", () => ({
  formatQuota: (quota: number, unlimited: boolean) =>
    unlimited || quota < 0 ? "Unlimited" : `$${quota}`,
}))

vi.mock("~/utils/core/formatters", () => ({
  formatKeyTime: (timestamp: number) =>
    timestamp <= 0 ? "Never expires" : "2023-11-14",
}))

describe("TokenDetails responsive layout", () => {
  it("lets metadata labels and values wrap on narrow screens", () => {
    render(
      <TokenDetails
        token={createToken({
          remain_quota: -1,
          unlimited_quota: true,
          used_quota: 123456789,
          expired_time: -1,
          created_time: 1700000000,
        })}
      />,
      {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    const remainingLabel = screen.getByText(
      "keyManagement:keyDetails.remainingQuota",
    )
    const details = remainingLabel.parentElement?.parentElement
    const remainingValue = screen.getByText("Unlimited")

    expect(details).toHaveClass("grid-cols-1", "xs:grid-cols-2")
    expect(remainingLabel.parentElement).toHaveClass(
      "flex",
      "flex-wrap",
      "break-words",
    )
    expect(remainingLabel).toHaveClass("shrink-0")
    expect(remainingValue).toHaveClass("min-w-0", "break-words")
    expect(remainingLabel.parentElement).not.toHaveClass("truncate")
  })
})
