import { act, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectViewportResizeProvider,
} from "~/components/ui/select"

function SelectFixture({ preserveOpen }: { preserveOpen: boolean }) {
  return (
    <SelectViewportResizeProvider preserveOpen={preserveOpen}>
      <Select defaultValue="first">
        <SelectTrigger aria-label="Example selection">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="first">First</SelectItem>
          <SelectItem value="second">Second</SelectItem>
        </SelectContent>
      </Select>
    </SelectViewportResizeProvider>
  )
}

function ControlledSelectFixture({
  onOpenChange,
}: {
  onOpenChange: (open: boolean) => void
}) {
  return (
    <SelectViewportResizeProvider preserveOpen>
      <Select open onOpenChange={onOpenChange} value="first">
        <SelectTrigger aria-label="Controlled selection">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="first">First</SelectItem>
        </SelectContent>
      </Select>
    </SelectViewportResizeProvider>
  )
}

describe("Select viewport resize behavior", () => {
  it("keeps an action-popup select open during its resize event", async () => {
    const user = userEvent.setup()
    render(<SelectFixture preserveOpen />)

    await user.click(
      screen.getByRole("combobox", { name: "Example selection" }),
    )
    expect(screen.getByRole("listbox")).toBeInTheDocument()

    act(() => {
      window.dispatchEvent(new Event("resize"))
    })

    expect(screen.getByRole("listbox")).toBeInTheDocument()
  })

  it("keeps the select open across consecutive resize events", async () => {
    const user = userEvent.setup()
    render(<SelectFixture preserveOpen />)

    await user.click(
      screen.getByRole("combobox", { name: "Example selection" }),
    )

    act(() => {
      window.dispatchEvent(new Event("resize"))
      window.dispatchEvent(new Event("resize"))
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(screen.getByRole("listbox")).toBeInTheDocument()
  })

  it("does not treat the pointer gesture that opens the select as close intent", () => {
    render(<SelectFixture preserveOpen />)

    const trigger = screen.getByRole("combobox", {
      name: "Example selection",
    })
    fireEvent.pointerDown(trigger, {
      button: 0,
      ctrlKey: false,
      pointerType: "mouse",
    })
    fireEvent.pointerUp(trigger, { pointerType: "mouse" })
    expect(screen.getByRole("listbox")).toBeInTheDocument()

    act(() => {
      window.dispatchEvent(new Event("resize"))
    })

    expect(screen.getByRole("listbox")).toBeInTheDocument()
  })

  it("retains Radix resize closing outside the action popup", async () => {
    const user = userEvent.setup()
    render(<SelectFixture preserveOpen={false} />)

    await user.click(
      screen.getByRole("combobox", { name: "Example selection" }),
    )

    act(() => {
      window.dispatchEvent(new Event("resize"))
    })

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
  })

  it("does not report a resize close to a controlled parent", () => {
    const onOpenChange = vi.fn()

    render(<ControlledSelectFixture onOpenChange={onOpenChange} />)

    act(() => {
      window.dispatchEvent(new Event("resize"))
    })

    expect(screen.getByRole("listbox")).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it("preserves assistive-technology click close intent during resize", async () => {
    const onOpenChange = vi.fn()

    render(<ControlledSelectFixture onOpenChange={onOpenChange} />)

    fireEvent.click(document, { detail: 0 })
    onOpenChange.mockClear()
    fireEvent.click(document, { detail: 0 })
    onOpenChange.mockClear()
    act(() => {
      window.dispatchEvent(new Event("resize"))
    })

    expect(onOpenChange).toHaveBeenCalledWith(false)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  })

  it("does not treat unrelated keys as close intent", () => {
    const onOpenChange = vi.fn()

    render(<ControlledSelectFixture onOpenChange={onOpenChange} />)

    fireEvent.keyDown(document, { key: "Tab" })
    act(() => {
      window.dispatchEvent(new Event("resize"))
    })

    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it("still closes with Escape when resize closing is suppressed", async () => {
    const user = userEvent.setup()
    render(<SelectFixture preserveOpen />)

    const trigger = screen.getByRole("combobox", {
      name: "Example selection",
    })
    await user.click(trigger)
    await user.keyboard("{Escape}")

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it("still closes when the popup window loses focus", async () => {
    const user = userEvent.setup()
    render(<SelectFixture preserveOpen />)

    await user.click(
      screen.getByRole("combobox", { name: "Example selection" }),
    )

    act(() => {
      window.dispatchEvent(new Event("blur"))
    })

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
  })

  it("still selects an option and closes normally", async () => {
    const user = userEvent.setup()
    render(<SelectFixture preserveOpen />)

    const trigger = screen.getByRole("combobox", {
      name: "Example selection",
    })
    await user.click(trigger)
    await user.click(screen.getByRole("option", { name: "Second" }))

    expect(trigger).toHaveTextContent("Second")
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
  })

  it("lets a pointer selection close during the popup resize task", async () => {
    const user = userEvent.setup()
    render(<SelectFixture preserveOpen />)

    const trigger = screen.getByRole("combobox", {
      name: "Example selection",
    })
    await user.click(trigger)
    const secondOption = screen.getByRole("option", { name: "Second" })

    act(() => {
      window.dispatchEvent(new Event("resize"))
      fireEvent.pointerDown(secondOption, { pointerType: "mouse" })
      fireEvent.pointerUp(secondOption, { pointerType: "mouse" })
    })

    expect(trigger).toHaveTextContent("Second")
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
  })
})
