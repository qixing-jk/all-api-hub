import { describe, expect, it, vi } from "vitest"

import { DestructiveConfirmDialog } from "~/components/ui"
import { render, screen } from "~~/tests/test-utils/render"

describe("DestructiveConfirmDialog", () => {
  it("uses the working label only while the destructive action is running", async () => {
    const props = {
      isOpen: true,
      onClose: vi.fn(),
      title: "Delete item",
      description: "This cannot be undone.",
      confirmLabel: "Delete",
      workingLabel: "Deleting...",
      cancelLabel: "Cancel",
      onConfirm: vi.fn(),
    }
    const { rerender } = render(<DestructiveConfirmDialog {...props} />)

    expect(
      await screen.findByRole("button", { name: "Delete" }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Deleting..." }),
    ).not.toBeInTheDocument()

    rerender(<DestructiveConfirmDialog {...props} isWorking />)

    const workingButton = await screen.findByRole("button", {
      name: "Deleting...",
    })

    expect(workingButton).toHaveTextContent("Deleting...")
    expect(workingButton).not.toHaveTextContent("Delete")
  })

  it("keeps the confirm label while working when no working label is provided", async () => {
    render(
      <DestructiveConfirmDialog
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
})
