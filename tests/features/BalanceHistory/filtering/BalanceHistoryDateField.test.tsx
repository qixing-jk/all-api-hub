import { expect, it, vi } from "vitest"

import { BalanceHistoryDateField } from "~/features/BalanceHistory/filtering/BalanceHistoryDateField"
import { render, screen } from "~~/tests/test-utils/render"

it("shows the latest selectable calendar month while the date is blank or its bounds change", () => {
  const props = {
    label: "Start date",
    value: "",
    minDayKey: "2026-01-01",
    maxDayKey: "2026-03-31",
    locale: undefined,
    onChange: vi.fn(),
  }
  const { rerender } = render(<BalanceHistoryDateField {...props} />, {
    withUserPreferencesProvider: false,
    withThemeProvider: false,
  })

  expect(screen.getByLabelText("Start date")).toHaveValue("")
  expect(screen.getByRole("grid")).toHaveAccessibleName(/March 2026/i)

  rerender(
    <BalanceHistoryDateField
      {...props}
      value="2026-03-10"
      maxDayKey="2026-02-28"
    />,
  )
  expect(screen.getByRole("grid")).toHaveAccessibleName(/February 2026/i)
  expect(screen.getByLabelText("Start date")).toHaveAttribute(
    "max",
    "2026-02-28",
  )
})
