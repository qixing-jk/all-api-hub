import userEvent from "@testing-library/user-event"
import { fr } from "react-day-picker/locale"
import { describe, expect, it } from "vitest"

import { Badge } from "~/components/ui/badge"
import { Calendar } from "~/components/ui/calendar"
import { Command, CommandItem, CommandList } from "~/components/ui/command"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "~/components/ui/dialog"
import { FormField } from "~/components/ui/FormField"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs"
import { render, screen, within } from "~~/tests/test-utils/render"

describe("modern primitive contracts", () => {
  it("associates successful and plain fields without empty descriptions", async () => {
    const { rerender } = render(
      <FormField label="Name" success="Available" orientation="horizontal">
        {(control) => <input {...control} />}
      </FormField>,
    )
    expect(
      await screen.findByRole("textbox", { name: "Name" }),
    ).toHaveAccessibleDescription("Available")
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    rerender(
      <FormField label="Name" orientation="responsive">
        {(control) => <input {...control} />}
      </FormField>,
    )
    expect(
      await screen.findByRole("textbox", { name: "Name" }),
    ).not.toHaveAttribute("aria-describedby")
  })

  it("leaves composite child labeling explicit and displays one validation error", async () => {
    render(
      <FormField label="Account" error="Name is required" success="Available">
        <input aria-label="Account name" />
      </FormField>,
    )
    expect(
      await screen.findByRole("textbox", { name: "Account name" }),
    ).not.toHaveAttribute("id")
    expect(screen.getByRole("alert")).toHaveTextContent("Name is required")
    expect(screen.queryByText("Available")).not.toBeInTheDocument()
    expect(screen.getByText("Account")).not.toHaveAttribute("for")
  })

  it("preserves link semantics when a badge renders its child", async () => {
    render(
      <>
        <Badge>Available</Badge>
        <Badge asChild variant="link">
          <a href="https://example.com/help">Read guide</a>
        </Badge>
      </>,
    )
    expect(
      await screen.findByRole("link", { name: "Read guide" }),
    ).toHaveAttribute("href", "https://example.com/help")
    expect(screen.getByText("Available")).toHaveAttribute(
      "data-variant",
      "default",
    )
    expect(screen.getAllByRole("link")).toHaveLength(1)
  })

  it.each(["default", "line", "unstyled"] as const)(
    "supports vertical keyboard navigation in %s tabs",
    async (variant) => {
      const user = userEvent.setup()
      render(
        <Tabs defaultValue="one" orientation="vertical">
          <TabsList variant={variant} aria-label="Settings">
            <TabsTrigger value="one">General</TabsTrigger>
            <TabsTrigger value="two">Advanced</TabsTrigger>
          </TabsList>
          <TabsContent value="one">General settings</TabsContent>
          <TabsContent value="two">Advanced settings</TabsContent>
        </Tabs>,
      )
      await user.click(await screen.findByRole("tab", { name: "General" }))
      await user.keyboard("{ArrowDown}")
      expect(screen.getByRole("tab", { name: "Advanced" })).toHaveFocus()
      expect(screen.getByRole("tab", { name: "Advanced" })).toHaveAttribute(
        "aria-selected",
        "true",
      )
      expect(screen.getByRole("tabpanel")).toHaveTextContent(
        "Advanced settings",
      )
    },
  )

  it("uses the translated default footer label to dismiss a dialog", async () => {
    const user = userEvent.setup()
    render(
      <Dialog defaultOpen>
        <DialogContent showCloseButton={false} aria-describedby={undefined}>
          <DialogTitle>Details</DialogTitle>
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>,
    )
    await user.click(
      await screen.findByRole("button", { name: "common:actions.close" }),
    )
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })
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
