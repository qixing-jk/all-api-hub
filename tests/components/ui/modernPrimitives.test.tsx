import userEvent from "@testing-library/user-event"
import { fr } from "react-day-picker/locale"
import { describe, expect, it } from "vitest"

import { Calendar } from "~/components/ui/calendar"
import { Command, CommandItem, CommandList } from "~/components/ui/command"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "~/components/ui/dialog"
import { FormField } from "~/components/ui/FormField"
import { render, screen, within } from "~~/tests/test-utils/render"

describe("modern primitive contracts", () => {
  it("keeps field help available while announcing distinct validation errors", async () => {
    render(
      <FormField
        label="Exchange rate"
        description="CNY per USD"
        errors={[
          { message: "Enter a positive rate" },
          { message: "Enter a positive rate" },
          { message: "Rate is required" },
        ]}
      >
        {(control) => <input {...control} />}
      </FormField>,
    )
    const input = await screen.findByRole("textbox", { name: "Exchange rate" })
    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(input).toHaveAccessibleDescription(
      "CNY per USD Enter a positive rate Rate is required",
    )
    const alert = screen.getByRole("alert")
    expect(within(alert).getAllByRole("listitem")).toHaveLength(2)
    await userEvent.click(screen.getByText("Exchange rate"))
    expect(input).toHaveFocus()
  })

  it("formats the month dropdown using the provided locale", async () => {
    render(
      <Calendar
        locale={fr}
        captionLayout="dropdown"
        defaultMonth={new Date(2026, 0, 1)}
      />,
    )
    expect(
      await screen.findByRole("option", { name: "janv." }),
    ).toBeInTheDocument()
  })

  it("keeps a committed command choice distinct from keyboard highlight", async () => {
    render(
      <Command>
        <CommandList>
          <CommandItem value="one" checked>
            Model one
          </CommandItem>
          <CommandItem value="two" checked={false}>
            Model two
          </CommandItem>
        </CommandList>
      </Command>,
    )
    expect(
      await screen.findByRole("option", { name: "Model one" }),
    ).toHaveAttribute("data-checked", "true")
    expect(screen.getByRole("option", { name: "Model two" })).toHaveAttribute(
      "data-checked",
      "false",
    )
  })

  it("closes an informational dialog through its optional translated footer action", async () => {
    render(
      <Dialog defaultOpen>
        <DialogContent showCloseButton={false} aria-describedby={undefined}>
          <DialogTitle>Copy invite</DialogTitle>
          <DialogFooter showCloseButton closeLabel="Dismiss invite" />
        </DialogContent>
      </Dialog>,
    )
    await userEvent.click(
      await screen.findByRole("button", { name: "Dismiss invite" }),
    )
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })
})
