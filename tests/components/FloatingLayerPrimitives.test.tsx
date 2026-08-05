import userEvent from "@testing-library/user-event"
import * as React from "react"
import { describe, expect, it, vi } from "vitest"

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
import { fireEvent, render, screen, waitFor } from "~~/tests/test-utils/render"

/**
 * Minimal legacy Modal host for select-layer assertions.
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
 * Minimal legacy Modal host for Base UI combobox layer assertions.
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

function ModalComboboxEscapeHarness({ onClose }: { onClose: () => void }) {
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
    <Modal isOpen={true} onClose={onClose}>
      <Combobox
        items={items}
        value={value}
        onValueChange={setValue}
        open={open}
        onOpenChange={setOpen}
      >
        <ComboboxInput
          aria-label="Escaped combobox in modal"
          className="w-48"
        />
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
  it("keeps Modal open when Escape closing is disabled", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(
      <Modal isOpen={true} onClose={onClose} closeOnEsc={false}>
        <button type="button">Inside modal</button>
      </Modal>,
    )

    await screen.findByRole("dialog")

    await user.keyboard("{Escape}")

    expect(onClose).not.toHaveBeenCalled()
  })

  it("requests Modal close when Escape starts inside the dialog", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(
      <Modal isOpen={true} onClose={onClose}>
        <button type="button">Inside modal</button>
      </Modal>,
    )

    await user.click(
      await screen.findByRole("button", { name: "Inside modal" }),
    )
    await user.keyboard("{Escape}")

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("keeps Modal open when backdrop closing is disabled", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(
      <Modal isOpen={true} onClose={onClose} closeOnBackdropClick={false}>
        <button type="button">Inside modal</button>
      </Modal>,
    )

    await screen.findByRole("dialog")

    const overlay = document.querySelector('[data-slot="modal-overlay"]')
    expect(overlay).toBeInTheDocument()

    await user.click(overlay as HTMLElement)

    expect(onClose).not.toHaveBeenCalled()
  })

  it("requests Modal close when clicking the visual backdrop around the panel", async () => {
    const onClose = vi.fn()

    render(
      <Modal isOpen={true} onClose={onClose}>
        <button type="button">Inside modal</button>
      </Modal>,
    )

    await screen.findByRole("dialog")

    const positioner = document.querySelector('[data-slot="modal-positioner"]')
    expect(positioner).toBeInTheDocument()

    fireEvent.pointerDown(positioner as HTMLElement)
    fireEvent.click(positioner as HTMLElement, { detail: 1 })

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("preserves non-pointer backdrop dismissal", async () => {
    const onClose = vi.fn()

    render(
      <Modal isOpen={true} onClose={onClose}>
        <button type="button">Inside modal</button>
      </Modal>,
    )

    await screen.findByRole("dialog")

    const positioner = document.querySelector('[data-slot="modal-positioner"]')
    expect(positioner).toBeInTheDocument()

    fireEvent.click(positioner as HTMLElement)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("clears backdrop pointer origin when the pointer is canceled", async () => {
    const onClose = vi.fn()

    render(
      <Modal isOpen={true} onClose={onClose}>
        <button type="button">Inside modal</button>
      </Modal>,
    )

    await screen.findByRole("dialog")

    const positioner = document.querySelector('[data-slot="modal-positioner"]')
    expect(positioner).toBeInTheDocument()

    fireEvent.pointerDown(positioner as HTMLElement)
    fireEvent.pointerCancel(positioner as HTMLElement)
    fireEvent.click(positioner as HTMLElement, { detail: 1 })

    expect(onClose).not.toHaveBeenCalled()
  })

  it("keeps Modal open when a pointer drag starts inside the panel", async () => {
    const onClose = vi.fn()

    render(
      <Modal isOpen={true} onClose={onClose}>
        <span>Selectable modal content</span>
      </Modal>,
    )

    const content = await screen.findByText("Selectable modal content")
    const positioner = document.querySelector('[data-slot="modal-positioner"]')
    expect(positioner).toBeInTheDocument()

    fireEvent.pointerDown(content)
    fireEvent.pointerUp(positioner as HTMLElement)
    fireEvent.click(positioner as HTMLElement, { detail: 1 })

    expect(onClose).not.toHaveBeenCalled()
  })

  it("uses Modal title as the dialog name without duplicating visible headings", async () => {
    render(
      <Modal
        isOpen={true}
        onClose={vi.fn()}
        title="Duplicate account cleanup"
        header={<h2>Duplicate account cleanup</h2>}
      >
        <button type="button">Inside modal</button>
      </Modal>,
    )

    expect(
      await screen.findByRole("dialog", {
        name: "Duplicate account cleanup",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getAllByRole("heading", {
        name: "Duplicate account cleanup",
      }),
    ).toHaveLength(1)
  })

  it("keeps the topmost Modal accessible when multiple legacy modals are open", async () => {
    const user = userEvent.setup()
    const onChildAction = vi.fn()

    render(
      <>
        <Modal
          isOpen={true}
          onClose={vi.fn()}
          title="Parent dialog"
          header={<h2>Parent dialog</h2>}
        >
          <button type="button">Parent action</button>
        </Modal>
        <Modal
          isOpen={true}
          onClose={vi.fn()}
          title="Child dialog"
          header={<h2>Child dialog</h2>}
        >
          <button type="button" onClick={onChildAction}>
            Child action
          </button>
        </Modal>
      </>,
    )

    await user.click(
      await screen.findByRole("button", { name: "Child action" }),
    )

    expect(onChildAction).toHaveBeenCalledTimes(1)
  })

  it("keeps a parent Modal open when a child Modal is opened from inside it", async () => {
    const user = userEvent.setup()
    const onParentClose = vi.fn()
    const onChildAction = vi.fn()

    function NestedModalHarness() {
      const [isChildOpen, setIsChildOpen] = React.useState(false)

      return (
        <>
          <Modal
            isOpen={true}
            onClose={onParentClose}
            title="Parent dialog"
            header={<h2>Parent dialog</h2>}
          >
            <button type="button" onClick={() => setIsChildOpen(true)}>
              Open child dialog
            </button>
          </Modal>
          <Modal
            isOpen={isChildOpen}
            onClose={() => setIsChildOpen(false)}
            title="Child dialog"
            header={<h2>Child dialog</h2>}
          >
            <button type="button" onClick={onChildAction}>
              Child action
            </button>
          </Modal>
        </>
      )
    }

    render(<NestedModalHarness />)

    await user.click(
      await screen.findByRole("button", { name: "Open child dialog" }),
    )
    await user.click(
      await screen.findByRole("button", { name: "Child action" }),
    )

    expect(onParentClose).not.toHaveBeenCalled()
    expect(onChildAction).toHaveBeenCalledTimes(1)
  })

  it("clears every drained workflow restorer before a later workflow reuses an id", async () => {
    const renderWorkflow = ({
      outerPresent = false,
      outerOpen = false,
      innerPresent = false,
      innerOpen = false,
      successorPresent = false,
      successorOpen = false,
    }: {
      outerPresent?: boolean
      outerOpen?: boolean
      innerPresent?: boolean
      innerOpen?: boolean
      successorPresent?: boolean
      successorOpen?: boolean
    }) => (
      <>
        <button type="button">Open first workflow</button>
        <button type="button">Open successor workflow</button>
        {outerPresent ? (
          <Modal
            isOpen={outerOpen}
            onClose={() => undefined}
            focusWorkflowId="outer-workflow"
          >
            <button type="button">Open nested workflow</button>
          </Modal>
        ) : null}
        {innerPresent ? (
          <Modal
            isOpen={innerOpen}
            onClose={() => undefined}
            focusWorkflowId="inner-workflow"
          >
            <button type="button">Nested workflow control</button>
          </Modal>
        ) : null}
        {successorPresent ? (
          <Modal
            isOpen={successorOpen}
            onClose={() => undefined}
            focusWorkflowId="outer-workflow"
          >
            <button type="button">Successor workflow control</button>
          </Modal>
        ) : null}
      </>
    )
    const view = render(renderWorkflow({}))

    const firstTrigger = await screen.findByRole("button", {
      name: "Open first workflow",
    })
    const successorTrigger = screen.getByRole("button", {
      name: "Open successor workflow",
    })
    firstTrigger.focus()
    view.rerender(renderWorkflow({ outerPresent: true, outerOpen: true }))
    const nestedTrigger = await screen.findByRole("button", {
      name: "Open nested workflow",
    })
    nestedTrigger.focus()
    view.rerender(
      renderWorkflow({
        outerPresent: true,
        outerOpen: true,
        innerPresent: true,
        innerOpen: true,
      }),
    )
    view.rerender(
      renderWorkflow({
        outerPresent: true,
        innerPresent: true,
        innerOpen: true,
      }),
    )
    view.rerender(renderWorkflow({ outerPresent: true, innerPresent: true }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await waitFor(() => expect(firstTrigger).toHaveFocus())

    successorTrigger.focus()
    view.rerender(
      renderWorkflow({ successorPresent: true, successorOpen: true }),
    )
    await screen.findByRole("button", { name: "Successor workflow control" })
    view.rerender(renderWorkflow({ successorPresent: true }))

    await waitFor(() => expect(successorTrigger).toHaveFocus())
    expect(firstTrigger).not.toHaveFocus()
  })

  it("does not request Modal close when selecting an item from a nested Select", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(
      <Modal isOpen={true} onClose={onClose}>
        <Select defaultValue="alpha">
          <SelectTrigger
            aria-label="Select without modal close"
            className="w-48"
          >
            <SelectValue placeholder="Choose a value" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alpha">Alpha</SelectItem>
            <SelectItem value="beta">Beta</SelectItem>
          </SelectContent>
        </Select>
      </Modal>,
    )

    await user.click(
      await screen.findByRole("combobox", {
        name: "Select without modal close",
      }),
    )
    await user.click(await screen.findByRole("option", { name: "Beta" }))

    expect(onClose).not.toHaveBeenCalled()
  })

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

  it("keeps Modal open when Escape closes a nested combobox popup", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(<ModalComboboxEscapeHarness onClose={onClose} />)

    await user.click(
      await screen.findByRole("combobox", {
        name: "Escaped combobox in modal",
      }),
    )
    await screen.findByText("Alpha")

    await user.keyboard("{Escape}")

    expect(onClose).not.toHaveBeenCalled()
  })
})
