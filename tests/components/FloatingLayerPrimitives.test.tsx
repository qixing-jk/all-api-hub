import userEvent from "@testing-library/user-event"
import * as React from "react"
import { describe, expect, it } from "vitest"

import {
  Modal,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Z_INDEX,
} from "~/components/ui"
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "~/components/ui/combobox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { render, screen } from "~~/tests/test-utils/render"

/**
 * Minimal HeadlessUI modal host for select-layer assertions.
 */
function ModalSelectHarness() {
  return (
    <Modal isOpen={true} onClose={() => {}}>
      <Select defaultValue="alpha">
        <SelectTrigger aria-label="Select in modal" className="w-48">
          <SelectValue placeholder="Choose a value" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="alpha">Alpha</SelectItem>
          <SelectItem value="beta">Beta</SelectItem>
        </SelectContent>
      </Select>
    </Modal>
  )
}

/**
 * Minimal Radix dialog host for dropdown-layer assertions.
 */
function DialogDropdownHarness() {
  return (
    <Dialog open={true}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dropdown host</DialogTitle>
          <DialogDescription>
            Verifies dropdown layering inside a Radix dialog host.
          </DialogDescription>
        </DialogHeader>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button">Open dropdown</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>Inspect layer</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Minimal HeadlessUI modal host for Base UI combobox layer assertions.
 */
function ModalComboboxHarness() {
  const items = React.useMemo(
    () => [
      { value: "alpha", label: "Alpha" },
      { value: "beta", label: "Beta" },
    ],
    [],
  )
  const [value, setValue] = React.useState<(typeof items)[number] | null>(null)
  const [open, setOpen] = React.useState(true)

  return (
    <Modal isOpen={true} onClose={() => {}}>
      <Combobox
        items={items}
        value={value}
        onValueChange={setValue}
        open={open}
        onOpenChange={setOpen}
      >
        <ComboboxInput aria-label="Combobox in modal" className="w-48" />
        <ComboboxContent>
          <ComboboxList>
            {(item) => (
              <ComboboxItem key={item.value} value={item}>
                {item.label}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </Modal>
  )
}

describe("floating layer primitives inside dialogs", () => {
  it("uses the modal-contained layer for select content inside Modal", async () => {
    const user = userEvent.setup()

    render(<ModalSelectHarness />)

    const modal = await screen.findByRole("dialog")
    expect(modal).toHaveClass(Z_INDEX.modal)

    await user.click(screen.getByRole("combobox", { name: "Select in modal" }))

    await screen.findByText("Beta")

    const content = document.querySelector('[data-slot="select-content"]')
    expect(content).toBeInTheDocument()
    expect(content).toHaveClass(Z_INDEX.modalFloating)
    expect(content).not.toHaveClass(Z_INDEX.floating)
  })

  it("uses the modal-contained layer for dropdown menus inside DialogContent", async () => {
    const user = userEvent.setup()

    render(<DialogDropdownHarness />)

    const dialogContent = await screen.findByRole("dialog")
    expect(dialogContent).toBeInTheDocument()
    expect(dialogContent).toHaveClass(Z_INDEX.modal)

    await user.click(screen.getByRole("button", { name: "Open dropdown" }))

    await screen.findByRole("menuitem", { name: "Inspect layer" })

    const content = document.querySelector(
      '[data-slot="dropdown-menu-content"]',
    )
    expect(content).toBeInTheDocument()
    expect(content).toHaveClass(Z_INDEX.modalFloating)
    expect(content).not.toHaveClass(Z_INDEX.floating)
  })

  it("uses the modal-contained layer for combobox popups inside Modal", async () => {
    render(<ModalComboboxHarness />)

    const modal = await screen.findByRole("dialog")
    expect(modal).toHaveClass(Z_INDEX.modal)

    await screen.findByText("Alpha")

    const popup = document.querySelector('[data-slot="combobox-content"]')
    expect(popup).toBeInTheDocument()

    const positioner = popup?.parentElement
    expect(positioner).toBeInTheDocument()
    expect(positioner).toHaveClass(Z_INDEX.modalFloating)
    expect(positioner).not.toHaveClass(Z_INDEX.floating)
  })
})
