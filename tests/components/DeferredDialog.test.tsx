import { act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { lazy, useState, type ComponentType } from "react"
import { expect, it, vi } from "vitest"

import { DeferredDialog } from "~/components/DeferredDialog"
import { RootErrorBoundary } from "~/components/RootErrorBoundary"
import { Modal } from "~/components/ui/Dialog/Modal"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

it.each([false, true])(
  "preserves other drafts when an on-demand dialog module fails (canceled: %s)",
  async (cancelBeforeFailure) => {
    type Props = { isOpen: boolean; onClose: () => void }
    let reject!: (error: Error) => void
    const Workspace = lazy(
      () =>
        new Promise<{ default: ComponentType<Props> }>((_, rejectModule) => {
          reject = rejectModule
        }),
    )
    function Example() {
      const [open, setOpen] = useState(false)
      const close = () => setOpen(false)
      return (
        <RootErrorBoundary>
          <input aria-label="Other draft" />
          <button onClick={() => setOpen(true)}>Open verification</button>
          {open && (
            <DeferredDialog isOpen={open} onClose={close}>
              <Workspace isOpen={open} onClose={close} />
            </DeferredDialog>
          )}
        </RootErrorBoundary>
      )
    }
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      const user = userEvent.setup()
      render(<Example />)
      const draft = await screen.findByRole("textbox", { name: "Other draft" })
      await user.type(draft, "Unsaved text")
      const opener = screen.getByRole("button", { name: "Open verification" })
      await user.click(opener)
      await screen.findByRole("dialog")
      if (cancelBeforeFailure) {
        await user.keyboard("{Escape}")
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
      }
      await act(async () => reject(new Error("Unavailable dialog module")))
      expect(screen.getByRole("textbox", { name: "Other draft" })).toBe(draft)
      expect(draft).toHaveValue("Unsaved text")
      if (cancelBeforeFailure) {
        expect(screen.queryByRole("dialog")).toBeNull()
        await user.click(opener)
      }
      await screen.findByRole("dialog", { name: "common:status.error" })
      await user.click(
        screen.getByRole("button", { name: "common:actions.close" }),
      )
      await waitFor(() => expect(opener).toHaveFocus())
      expect(draft).toHaveValue("Unsaved text")
    } finally {
      consoleError.mockRestore()
    }
  },
)

it("keeps a canceled cold dialog closed when its module arrives and allows reopening", async () => {
  type Props = { isOpen: boolean; onClose: () => void }
  let resolve!: (module: { default: ComponentType<Props> }) => void
  const Workspace = lazy(
    () =>
      new Promise<{ default: ComponentType<Props> }>((ready) => {
        resolve = ready
      }),
  )
  function Example() {
    const [open, setOpen] = useState(false)
    const close = () => setOpen(false)
    return (
      <>
        <button onClick={() => setOpen(true)}>Open editor</button>
        {open && (
          <DeferredDialog isOpen={open} onClose={close}>
            <Workspace isOpen={open} onClose={close} />
          </DeferredDialog>
        )}
      </>
    )
  }
  const user = userEvent.setup()
  render(<Example />)
  const opener = await screen.findByRole("button", { name: "Open editor" })
  await user.click(opener)
  await screen.findByRole("dialog")
  await user.keyboard("{Escape}")
  await waitFor(() => expect(opener).toHaveFocus())
  await act(async () => {
    resolve({
      default: (props) => (
        <Modal {...props} restoreDeferredFocus title="Editor">
          <input aria-label="Draft" />
        </Modal>
      ),
    })
  })
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  await user.click(opener)
  await user.type(
    await screen.findByRole("textbox", { name: "Draft" }),
    "New draft",
  )
  await user.keyboard("{Escape}")
  await waitFor(() => expect(opener).toHaveFocus())
})

it("restores the original opener after a cold dialog replaces its loading surface", async () => {
  type Props = { isOpen: boolean; onClose: () => void }
  let resolve!: (module: { default: ComponentType<Props> }) => void
  const Workspace = lazy(
    () =>
      new Promise<{ default: ComponentType<Props> }>((ready) => {
        resolve = ready
      }),
  )
  function Example() {
    const [open, setOpen] = useState(false)
    const close = () => setOpen(false)
    return (
      <>
        <button onClick={() => setOpen(true)}>Open editor</button>
        {open && (
          <DeferredDialog isOpen={open} onClose={close}>
            <Workspace isOpen={open} onClose={close} />
          </DeferredDialog>
        )}
      </>
    )
  }
  const user = userEvent.setup()
  render(<Example />)
  const opener = await screen.findByRole("button", { name: "Open editor" })
  await user.click(opener)
  await screen.findByRole("dialog")
  await act(async () => {
    resolve({
      default: (props) => (
        <Modal {...props} restoreDeferredFocus title="Editor">
          <button>Editor action</button>
        </Modal>
      ),
    })
  })
  await user.click(await screen.findByRole("button", { name: "Editor action" }))
  await user.keyboard("{Escape}")
  await waitFor(() => expect(opener).toHaveFocus())
})

it("returns focus to the main dialog when a sibling auxiliary dialog closes", async () => {
  function Example() {
    const [open, setOpen] = useState(false)
    const [childOpen, setChildOpen] = useState(false)
    return (
      <>
        <button onClick={() => setOpen(true)}>Open workspace</button>
        <DeferredDialog isOpen={open} onClose={() => setOpen(false)}>
          <Modal
            isOpen={open}
            restoreDeferredFocus
            onClose={() => setOpen(false)}
            title="Workspace"
          >
            <button onClick={() => setChildOpen(true)}>Create key</button>
          </Modal>
          <Modal
            isOpen={childOpen}
            onClose={() => setChildOpen(false)}
            title="New key"
          >
            <input aria-label="Key name" />
          </Modal>
        </DeferredDialog>
      </>
    )
  }
  const user = userEvent.setup()
  render(<Example />)
  const opener = await screen.findByRole("button", { name: "Open workspace" })
  await user.click(opener)
  const create = await screen.findByRole("button", { name: "Create key" })
  await user.click(create)
  await user.click(await screen.findByRole("textbox", { name: "Key name" }))
  await user.keyboard("{Escape}")
  await waitFor(() => expect(create).toHaveFocus())
  await user.keyboard("{Escape}")
  await waitFor(() => expect(opener).toHaveFocus())
})
