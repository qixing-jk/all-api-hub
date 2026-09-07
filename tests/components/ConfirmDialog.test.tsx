import userEvent from "@testing-library/user-event"
import { SendToBack } from "lucide-react"
import { describe, expect, it, vi } from "vitest"

import { ConfirmDialog } from "~/components/ui"
import { render, screen } from "~~/tests/test-utils/render"

describe("ConfirmDialog", () => {
  it("defaults to a general confirmation with a neutral icon", async () => {
    render(
      <ConfirmDialog
        isOpen
        onClose={vi.fn()}
        title="Confirm action"
        description="Review the action before continuing."
        confirmLabel="Continue"
        cancelLabel="Cancel"
        onConfirm={vi.fn()}
      />,
    )

    const dialog = await screen.findByRole("dialog", { name: "Confirm action" })
    expect(screen.getByRole("button", { name: "Continue" })).toHaveAttribute(
      "data-variant",
      "default",
    )
    expect(
      dialog.querySelector(".lucide-circle-help, .lucide-circle-question-mark"),
    ).toBeInTheDocument()
    expect(
      dialog.querySelector(".lucide-trash2, .lucide-trash-2"),
    ).not.toBeInTheDocument()
  })

  it.each([
    ["confirm", "default"],
    ["warning", "warning"],
    ["destructive", "destructive"],
  ] as const)(
    "uses %s intent without assuming a deletion",
    async (intent, variant) => {
      render(
        <ConfirmDialog
          intent={intent}
          isOpen
          onClose={vi.fn()}
          title="Confirm action"
          description="Review the action before continuing."
          confirmLabel="Continue"
          cancelLabel="Cancel"
          onConfirm={vi.fn()}
        />,
      )

      expect(
        await screen.findByRole("button", { name: "Continue" }),
      ).toHaveAttribute("data-variant", variant)
      const deleteIcon = screen
        .getByRole("dialog", { name: "Confirm action" })
        .querySelector(".lucide-trash2, .lucide-trash-2")
      expect(deleteIcon).not.toBeInTheDocument()
    },
  )

  it("uses the working label only while the destructive action is running", async () => {
    const user = userEvent.setup()
    const props = {
      intent: "destructive" as const,
      isOpen: true,
      onClose: vi.fn(),
      title: "Delete item",
      description: "This cannot be undone.",
      confirmLabel: "Delete",
      workingLabel: "Deleting...",
      cancelLabel: "Cancel",
      onConfirm: vi.fn(),
    }
    const { rerender } = render(<ConfirmDialog {...props} />)

    expect(
      await screen.findByRole("button", { name: "Delete" }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Deleting..." }),
    ).not.toBeInTheDocument()

    rerender(<ConfirmDialog {...props} isWorking />)

    const workingButton = await screen.findByRole("button", {
      name: "Deleting...",
    })

    expect(workingButton).toHaveTextContent("Deleting...")
    expect(workingButton).not.toHaveTextContent("Delete")
    expect(workingButton).toBeDisabled()
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled()

    await user.click(workingButton)
    await user.keyboard("{Escape}")

    expect(props.onConfirm).not.toHaveBeenCalled()
    expect(props.onClose).not.toHaveBeenCalled()
  })

  it("keeps the confirm label while working when no working label is provided", async () => {
    render(
      <ConfirmDialog
        intent="destructive"
        isOpen
        isWorking
        onClose={vi.fn()}
        title="Delete item"
        description="This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={vi.fn()}
      />,
    )

    expect(
      await screen.findByRole("button", { name: "Delete" }),
    ).toHaveTextContent("Delete")
  })

  it("exposes optional stable selectors for both dialog actions", async () => {
    render(
      <ConfirmDialog
        intent="destructive"
        isOpen
        onClose={vi.fn()}
        title="Delete item"
        description="This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={vi.fn()}
        confirmButtonTestId="delete-confirm"
        cancelButtonTestId="delete-cancel"
      />,
    )

    expect(await screen.findByTestId("delete-confirm")).toBeInTheDocument()
    expect(screen.getByTestId("delete-cancel")).toBeInTheDocument()
  })

  it("uses an action-specific icon with the confirmation intent", async () => {
    render(
      <ConfirmDialog
        intent="confirm"
        isOpen
        onClose={vi.fn()}
        title="Import selected keys"
        description="This creates channels for the selected keys."
        confirmLabel="Import"
        cancelLabel="Cancel"
        onConfirm={vi.fn()}
        icon={SendToBack}
      />,
    )

    const dialog = await screen.findByRole("dialog", {
      name: "Import selected keys",
    })
    expect(dialog.querySelector(".lucide-send-to-back")).toHaveClass(
      "text-primary",
    )
    expect(screen.getByRole("button", { name: "Import" })).toHaveAttribute(
      "data-variant",
      "default",
    )
  })
})
