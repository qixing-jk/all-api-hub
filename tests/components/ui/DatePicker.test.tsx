import userEvent from "@testing-library/user-event"
import dayjs from "dayjs"
import { describe, expect, it, vi } from "vitest"

import { DatePicker } from "~/components/ui/DatePicker"
import { render, screen, within } from "~~/tests/test-utils/render"

const labels = {
  trigger: "Expiration date",
  placeholder: "Select expiration date",
  noExpiration: "No expiration",
  in7Days: "+7 days",
  in30Days: "+30 days",
  in90Days: "+90 days",
  in1Year: "+1 year",
  naturalInput: {
    invalid: "Enter a recognizable date",
    label: "Natural date",
    openCalendar: "Open calendar",
    placeholder: "Try 7 days later",
    preview: "Will set to {{date}}",
  },
}

describe("DatePicker", () => {
  it("applies quick expiry presets as canonical YYYY-MM-DD values", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(<DatePicker value="" onChange={onChange} labels={labels} />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    await user.click(
      screen.getByRole("button", {
        name: `${labels.trigger}: ${labels.placeholder}`,
      }),
    )
    await user.click(screen.getByRole("button", { name: labels.in7Days }))

    expect(onChange).toHaveBeenCalledWith(
      dayjs().add(7, "day").format("YYYY-MM-DD"),
    )
  })

  it("renders popover content inside the provided portal container and clears values", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const portalContainer = document.createElement("div")
    document.body.appendChild(portalContainer)

    render(
      <DatePicker
        value="2026-07-31"
        onChange={onChange}
        labels={labels}
        portalContainer={portalContainer}
      />,
      {
        withUserPreferencesProvider: false,
        withThemeProvider: false,
      },
    )

    await user.click(
      screen.getByRole("button", {
        name: `${labels.trigger}: 2026-07-31`,
      }),
    )
    expect(portalContainer).toContainElement(
      within(portalContainer).getByRole("button", {
        name: labels.in7Days,
      }),
    )
    expect(
      within(portalContainer).queryByRole("button", {
        name: "End of month",
      }),
    ).not.toBeInTheDocument()
    await user.click(
      within(portalContainer).getByRole("button", {
        name: labels.noExpiration,
      }),
    )

    expect(onChange).toHaveBeenCalledWith("")
  })

  it("includes the selected value in the trigger accessible name", () => {
    render(
      <DatePicker value="2026-07-31" onChange={vi.fn()} labels={labels} />,
      {
        withUserPreferencesProvider: false,
        withThemeProvider: false,
      },
    )

    expect(
      screen.getByRole("button", {
        name: `${labels.trigger}: 2026-07-31`,
      }),
    ).toBeVisible()
  })

  it("previews natural input without committing until Enter is pressed", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <DatePicker value="" onChange={onChange} labels={labels} naturalInput />,
      {
        withUserPreferencesProvider: false,
        withThemeProvider: false,
      },
    )

    await user.type(screen.getByLabelText(labels.naturalInput.label), "7天后")
    const expectedDate = dayjs().add(7, "day").format("YYYY-MM-DD")

    expect(onChange).not.toHaveBeenCalled()
    expect(
      screen.getByText(
        labels.naturalInput.preview.replace("{{date}}", expectedDate),
      ),
    ).toBeVisible()

    await user.keyboard("{Enter}")

    expect(onChange).toHaveBeenCalledWith(expectedDate)
  })

  it("commits valid natural input when focus leaves the field", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <div>
        <DatePicker value="" onChange={onChange} labels={labels} naturalInput />
        <button type="button">Save</button>
      </div>,
      {
        withUserPreferencesProvider: false,
        withThemeProvider: false,
      },
    )

    await user.type(screen.getByLabelText(labels.naturalInput.label), "7天后")
    await user.click(screen.getByRole("button", { name: "Save" }))

    expect(onChange).toHaveBeenCalledWith(
      dayjs().add(7, "day").format("YYYY-MM-DD"),
    )
  })

  it("commits an empty natural input as no expiration", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <DatePicker
        value="2026-07-31"
        onChange={onChange}
        labels={labels}
        naturalInput
      />,
      {
        withUserPreferencesProvider: false,
        withThemeProvider: false,
      },
    )

    const input = screen.getByLabelText(labels.naturalInput.label)
    await user.clear(input)
    await user.keyboard("{Enter}")

    expect(onChange).toHaveBeenCalledWith("")
  })

  it("opens the calendar from the trailing icon button", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <DatePicker value="" onChange={onChange} labels={labels} naturalInput />,
      {
        withUserPreferencesProvider: false,
        withThemeProvider: false,
      },
    )

    expect(screen.queryByRole("grid")).not.toBeInTheDocument()

    await user.click(
      screen.getByRole("button", {
        name: `${labels.trigger}: ${labels.naturalInput.openCalendar}`,
      }),
    )

    expect(screen.getByRole("grid")).toBeVisible()
  })

  it("shows an inline error instead of accepting unrecognized natural input", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <DatePicker value="" onChange={onChange} labels={labels} naturalInput />,
      {
        withUserPreferencesProvider: false,
        withThemeProvider: false,
      },
    )

    await user.type(
      screen.getByLabelText(labels.naturalInput.label),
      "202607-01-01",
    )

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByText(labels.naturalInput.invalid)).toBeVisible()
  })
})
