import { act, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { StrictMode, useState } from "react"
import { describe, expect, it, vi } from "vitest"

import { Modal } from "~/components/ui/Dialog/Modal"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

describe("Modal", () => {
  it("keeps the newest initially open StrictMode session focused after older close autofocus settles", async () => {
    vi.useFakeTimers()
    try {
      const ModalHarness = () => {
        const [session, setSession] = useState<"a" | "b">("a")
        return (
          <>
            <button type="button" onClick={() => setSession("b")}>
              Replace with B
            </button>
            <Modal
              key={session}
              isOpen
              onClose={() => undefined}
              title={`${session} modal`}
            >
              <button type="button">{session} action</button>
            </Modal>
          </>
        )
      }
      render(
        <StrictMode>
          <ModalHarness />
        </StrictMode>,
        { withUserPreferencesProvider: false, withThemeProvider: false },
      )

      await act(async () => {})
      fireEvent.click(screen.getByRole("button", { name: "Replace with B" }))
      await act(async () => {})
      const replacement = screen.getByRole("dialog")
      expect(replacement).toHaveTextContent("b action")
      await act(async () => vi.runOnlyPendingTimers())
      expect(replacement.contains(document.activeElement)).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it("moves focus into the dialog and restores its opener after Escape closes it", async () => {
    const user = userEvent.setup()
    const ModalHarness = () => {
      const [isOpen, setIsOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setIsOpen(true)}>
            Open first modal
          </button>
          <button type="button" onClick={() => setIsOpen(true)}>
            Open second modal
          </button>
          <Modal
            isOpen={isOpen}
            onClose={() => setIsOpen(false)}
            title="Example modal"
          >
            <button type="button">Modal action</button>
          </Modal>
        </>
      )
    }
    render(<ModalHarness />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    const firstTrigger = screen.getByRole("button", {
      name: "Open first modal",
    })
    await user.click(firstTrigger)
    const dialog = await screen.findByRole("dialog")
    expect(dialog.contains(document.activeElement)).toBe(true)

    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(firstTrigger).toHaveFocus()

    const secondTrigger = screen.getByRole("button", {
      name: "Open second modal",
    })
    await user.click(secondTrigger)
    expect(await screen.findByRole("dialog")).toBeVisible()
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(secondTrigger).toHaveFocus()
  })

  it("notifies after a controlled close restores focus", async () => {
    const user = userEvent.setup()
    const onCloseComplete = vi.fn()
    const ModalHarness = () => {
      const [isOpen, setIsOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setIsOpen(true)}>
            Open controlled modal
          </button>
          <Modal
            isOpen={isOpen}
            onClose={() => setIsOpen(false)}
            onCloseComplete={onCloseComplete}
            title="Controlled modal"
          >
            <button type="button" onClick={() => setIsOpen(false)}>
              Close controlled modal
            </button>
          </Modal>
        </>
      )
    }
    render(<ModalHarness />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    const trigger = screen.getByRole("button", {
      name: "Open controlled modal",
    })
    await user.click(trigger)
    await user.click(
      await screen.findByRole("button", { name: "Close controlled modal" }),
    )

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(trigger).toHaveFocus()
    expect(onCloseComplete).toHaveBeenCalledOnce()
  })

  it("notifies only for the real close lifecycle under StrictMode", async () => {
    const user = userEvent.setup()
    const onCloseComplete = vi.fn()
    const ModalHarness = () => {
      const [isOpen, setIsOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setIsOpen(true)}>
            Open strict modal
          </button>
          <Modal
            isOpen={isOpen}
            onClose={() => setIsOpen(false)}
            onCloseComplete={onCloseComplete}
            title="Strict modal"
          >
            <button type="button">Strict modal content</button>
          </Modal>
        </>
      )
    }

    render(
      <StrictMode>
        <ModalHarness />
      </StrictMode>,
      {
        withUserPreferencesProvider: false,
        withThemeProvider: false,
      },
    )

    const trigger = screen.getByRole("button", { name: "Open strict modal" })
    await user.click(trigger)
    expect(await screen.findByRole("dialog")).toBeVisible()
    await act(async () => undefined)
    expect(onCloseComplete).not.toHaveBeenCalled()

    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(trigger).toHaveFocus()
    expect(onCloseComplete).toHaveBeenCalledOnce()
  })

  it("restores the correct trigger through StrictMode and rapid reopen cycles", async () => {
    const user = userEvent.setup()
    const ModalHarness = () => {
      const [openModal, setOpenModal] = useState<"first" | "second" | null>(
        null,
      )
      return (
        <>
          <button type="button" onClick={() => setOpenModal("first")}>
            First trigger
          </button>
          <button type="button" onClick={() => setOpenModal("second")}>
            Second trigger
          </button>
          <Modal
            isOpen={openModal !== null}
            onClose={() => setOpenModal(null)}
            title="Example modal"
          >
            <button type="button">Modal action</button>
          </Modal>
        </>
      )
    }
    render(
      <StrictMode>
        <ModalHarness />
      </StrictMode>,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )

    const first = screen.getByRole("button", { name: "First trigger" })
    const second = screen.getByRole("button", { name: "Second trigger" })
    await user.click(first)
    await screen.findByRole("dialog")
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(first).toHaveFocus()

    await user.click(second)
    await screen.findByRole("dialog")
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(second).toHaveFocus()
  })

  it("keeps a reopened modal focused while a prior close autofocus is deferred", async () => {
    vi.useFakeTimers()
    try {
      const ModalHarness = () => {
        const [isOpen, setIsOpen] = useState(false)
        return (
          <>
            <button type="button" onClick={() => setIsOpen(true)}>
              First trigger
            </button>
            <button type="button" onClick={() => setIsOpen(true)}>
              Second trigger
            </button>
            <Modal
              isOpen={isOpen}
              onClose={() => setIsOpen(false)}
              title="Example modal"
            >
              <button type="button">Modal action</button>
            </Modal>
          </>
        )
      }
      render(<ModalHarness />, {
        withUserPreferencesProvider: false,
        withThemeProvider: false,
      })

      const first = screen.getByRole("button", { name: "First trigger" })
      const second = screen.getByRole("button", { name: "Second trigger" })
      fireEvent.click(first)
      await act(async () => {})
      const firstDialog = screen.getByRole("dialog")
      expect(firstDialog.contains(document.activeElement)).toBe(true)

      fireEvent.click(
        screen.getByRole("button", { name: "common:actions.close" }),
      )
      second.focus()
      fireEvent.click(second)
      await act(async () => {})
      const reopenedDialog = screen.getByRole("dialog")
      expect(reopenedDialog.contains(document.activeElement)).toBe(true)

      await act(async () => vi.runOnlyPendingTimers())
      expect(reopenedDialog.contains(document.activeElement)).toBe(true)

      fireEvent.click(
        screen.getByRole("button", { name: "common:actions.close" }),
      )
      await act(async () => {})
      await act(async () => vi.runOnlyPendingTimers())
      expect(second).toHaveFocus()
    } finally {
      vi.useRealTimers()
    }
  })

  it("does not let a keyed, unmounted session restore focus over its replacement", async () => {
    vi.useFakeTimers()
    try {
      const ModalHarness = () => {
        const [session, setSession] = useState<"first" | "second" | null>(null)
        return (
          <>
            <button type="button" onClick={() => setSession("first")}>
              Open first session
            </button>
            <button type="button" onClick={() => setSession("second")}>
              Replace with second session
            </button>
            {session ? (
              <Modal
                key={session}
                isOpen
                onClose={() => setSession(null)}
                title={`${session} session`}
              >
                <button type="button">{session} action</button>
              </Modal>
            ) : null}
          </>
        )
      }
      render(<ModalHarness />, {
        withUserPreferencesProvider: false,
        withThemeProvider: false,
      })

      const firstTrigger = screen.getByRole("button", {
        name: "Open first session",
      })
      const replacementTrigger = screen.getByRole("button", {
        name: "Replace with second session",
      })
      fireEvent.click(firstTrigger)
      await act(async () => {})
      replacementTrigger.focus()
      fireEvent.click(replacementTrigger)
      await act(async () => {})
      const replacement = screen.getByRole("dialog")
      expect(replacement).toHaveTextContent("second action")

      await act(async () => vi.runOnlyPendingTimers())
      expect(replacement.contains(document.activeElement)).toBe(true)
      expect(firstTrigger).not.toHaveFocus()

      fireEvent.click(
        screen.getByRole("button", { name: "common:actions.close" }),
      )
      await act(async () => vi.runOnlyPendingTimers())
      expect(replacementTrigger).toHaveFocus()
    } finally {
      vi.useRealTimers()
    }
  })

  it("does not carry close intent from a reopened session into a keyed replacement", async () => {
    vi.useFakeTimers()
    try {
      const ModalHarness = () => {
        const [session, setSession] = useState<"first" | "second" | null>(null)
        return (
          <>
            <button type="button" onClick={() => setSession("first")}>
              Open first
            </button>
            <button type="button" onClick={() => setSession("second")}>
              Replace with second
            </button>
            {session ? (
              <Modal
                key={session}
                isOpen
                onClose={() => setSession(null)}
                title={`${session} session`}
              >
                <button type="button">{session} action</button>
              </Modal>
            ) : null}
          </>
        )
      }
      render(<ModalHarness />, {
        withUserPreferencesProvider: false,
        withThemeProvider: false,
      })

      const firstTrigger = screen.getByRole("button", { name: "Open first" })
      const replacementTrigger = screen.getByRole("button", {
        name: "Replace with second",
      })
      fireEvent.click(firstTrigger)
      await act(async () => {})
      fireEvent.click(
        screen.getByRole("button", { name: "common:actions.close" }),
      )
      fireEvent.click(firstTrigger)
      await act(async () => {})
      replacementTrigger.focus()
      fireEvent.click(replacementTrigger)
      await act(async () => vi.runOnlyPendingTimers())

      const replacement = screen.getByRole("dialog")
      expect(replacement).toHaveTextContent("second action")
      expect(replacement).toContainElement(
        document.activeElement as HTMLElement,
      )
      expect(firstTrigger).not.toHaveFocus()
      fireEvent.click(
        screen.getByRole("button", { name: "common:actions.close" }),
      )
      await act(async () => vi.runOnlyPendingTimers())
      expect(replacementTrigger).toHaveFocus()
    } finally {
      vi.useRealTimers()
    }
  })

  it("restores focus to each nested modal's own opener", async () => {
    const user = userEvent.setup()
    const ModalHarness = () => {
      const [isParentOpen, setIsParentOpen] = useState(false)
      const [isChildOpen, setIsChildOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setIsParentOpen(true)}>
            Open parent
          </button>
          <Modal
            isOpen={isParentOpen}
            onClose={() => setIsParentOpen(false)}
            title="Parent modal"
          >
            <button type="button" onClick={() => setIsChildOpen(true)}>
              Open child
            </button>
            <Modal
              isOpen={isChildOpen}
              onClose={() => setIsChildOpen(false)}
              title="Child modal"
            >
              <button type="button">Child action</button>
            </Modal>
          </Modal>
        </>
      )
    }
    render(<ModalHarness />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    const parentTrigger = screen.getByRole("button", { name: "Open parent" })
    await user.click(parentTrigger)
    await screen.findByRole("dialog")

    const childTrigger = screen.getByRole("button", { name: "Open child" })
    await user.click(childTrigger)
    await waitFor(() => expect(screen.getAllByRole("dialog")).toHaveLength(2))
    const childDialog = screen.getAllByRole("dialog")[1]!
    expect(childDialog.contains(document.activeElement)).toBe(true)

    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.getAllByRole("dialog")).toHaveLength(1))
    expect(childTrigger).toHaveFocus()

    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(parentTrigger).toHaveFocus()
  })

  it("drains an outer-first close after the still-mounted inner session settles", async () => {
    const user = userEvent.setup()
    const ModalHarness = () => {
      const [isParentOpen, setIsParentOpen] = useState(false)
      const [isChildOpen, setIsChildOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setIsParentOpen(true)}>
            Open parent
          </button>
          <button type="button" onClick={() => setIsParentOpen(false)}>
            Close outer
          </button>
          <Modal
            isOpen={isParentOpen}
            onClose={() => setIsParentOpen(false)}
            title="Parent modal"
          >
            <button type="button" onClick={() => setIsChildOpen(true)}>
              Open child
            </button>
          </Modal>
          <Modal
            isOpen={isChildOpen}
            onClose={() => setIsChildOpen(false)}
            title="Child modal"
          >
            <button type="button">Child action</button>
          </Modal>
        </>
      )
    }
    render(<ModalHarness />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    const parentTrigger = screen.getByRole("button", { name: "Open parent" })
    await user.click(parentTrigger)
    await user.click(screen.getByRole("button", { name: "Open child" }))
    await waitFor(() => expect(screen.getAllByRole("dialog")).toHaveLength(2))
    await user.click(screen.getByRole("button", { name: "Close outer" }))
    await waitFor(() => expect(screen.getAllByRole("dialog")).toHaveLength(1))
    const child = screen.getByRole("dialog")
    const childAction = screen.getByRole("button", { name: "Child action" })
    childAction.focus()
    expect(child).toContainElement(document.activeElement as HTMLElement)
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(parentTrigger).toHaveFocus()
  })

  it("drains a non-top close requested through the outer Modal itself", async () => {
    const user = userEvent.setup()
    const ModalHarness = () => {
      const [isParentOpen, setIsParentOpen] = useState(false)
      const [isChildOpen, setIsChildOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setIsParentOpen(true)}>
            Open parent request-close
          </button>
          <Modal
            isOpen={isParentOpen}
            onClose={() => setIsParentOpen(false)}
            title="Parent request-close modal"
          >
            <button type="button" onClick={() => setIsChildOpen(true)}>
              Open child request-close
            </button>
          </Modal>
          <Modal
            isOpen={isChildOpen}
            onClose={() => setIsChildOpen(false)}
            title="Child request-close modal"
          >
            <button type="button">Child request-close action</button>
          </Modal>
        </>
      )
    }
    render(<ModalHarness />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    const parentTrigger = screen.getByRole("button", {
      name: "Open parent request-close",
    })
    await user.click(parentTrigger)
    await user.click(
      screen.getByRole("button", { name: "Open child request-close" }),
    )
    await waitFor(() => expect(screen.getAllByRole("dialog")).toHaveLength(2))

    const closeButtons = screen.getAllByRole("button", {
      name: "common:actions.close",
      hidden: true,
    })
    fireEvent.click(closeButtons[0]!)
    await waitFor(() => expect(screen.getAllByRole("dialog")).toHaveLength(1))
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(parentTrigger).toHaveFocus()
  })
})
