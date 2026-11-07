import { expect, it, vi } from "vitest"

import { BalanceHistoryDateField } from "~/features/BalanceHistory/filtering/BalanceHistoryDateField"
import { fireEvent, render, screen } from "~~/tests/test-utils/render"

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

it("commits a date only after Enter or blur", () => {
  const onChange = vi.fn()
  render(
    <BalanceHistoryDateField
      label="End date"
      value="2026-03-15"
      minDayKey="2026-01-01"
      maxDayKey="2026-03-31"
      locale={undefined}
      onChange={onChange}
    />,
    { withUserPreferencesProvider: false, withThemeProvider: false },
  )

  const input = screen.getByLabelText("End date")
  input.focus()
  fireEvent.keyDown(input, { key: "ArrowRight" })
  fireEvent.change(input, { target: { value: "0002-03-15" } })
  expect(input).toHaveValue("0002-03-15")
  expect(screen.getByRole("grid")).toHaveAccessibleName(/March 2026/i)
  expect(onChange).not.toHaveBeenCalled()

  fireEvent.change(input, { target: { value: "2026-02-10" } })
  fireEvent.keyDown(input, { key: "Enter" })
  expect(onChange).toHaveBeenCalledExactlyOnceWith("2026-02-10")

  fireEvent.blur(input)
  expect(onChange).toHaveBeenCalledTimes(1)
  fireEvent.change(input, { target: { value: "2026-03-20" } })
  fireEvent.blur(input)
  expect(onChange).toHaveBeenLastCalledWith("2026-03-20")
})

it("discards a draft when the committed date changes externally", () => {
  const props = {
    label: "End date",
    value: "2026-03-15",
    minDayKey: "2026-01-01",
    maxDayKey: "2026-03-31",
    locale: undefined,
    onChange: vi.fn(),
  }
  const { rerender } = render(<BalanceHistoryDateField {...props} />, {
    withUserPreferencesProvider: false,
    withThemeProvider: false,
  })

  const input = screen.getByLabelText("End date")
  input.focus()
  fireEvent.change(input, { target: { value: "2026-02-10" } })
  expect(input).toHaveValue("2026-02-10")

  rerender(<BalanceHistoryDateField {...props} value="2026-03-20" />)
  expect(input).toHaveValue("2026-03-20")
  fireEvent.blur(input)
  expect(props.onChange).not.toHaveBeenCalled()
})
