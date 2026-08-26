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

  it("allows long localized action labels to wrap inside the dialog footer", async () => {
    render(
      <DestructiveConfirmDialog
        isOpen
        onClose={vi.fn()}
        title="Erweiterung neu laden"
        description="Die Erweiterung muss neu geladen werden."
        confirmLabel="Erweiterung neu laden und erneut versuchen"
        cancelLabel="Abbrechen"
        onConfirm={vi.fn()}
      />,
    )

    const confirmButton = await screen.findByRole("button", {
      name: "Erweiterung neu laden und erneut versuchen",
    })
    expect(confirmButton).toHaveClass("min-w-0", "shrink", "whitespace-normal")
    expect(confirmButton).not.toHaveClass("shrink-0", "whitespace-nowrap")
  })

  it("exposes optional stable selectors for both dialog actions", async () => {
    render(
      <DestructiveConfirmDialog
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

  it("allows a non-destructive caller to replace the delete affordance", async () => {
    render(
      <DestructiveConfirmDialog
        isOpen
        onClose={vi.fn()}
        title="Import selected keys"
        description="This creates channels for the selected keys."
        confirmLabel="Import"
        cancelLabel="Cancel"
        onConfirm={vi.fn()}
        icon={<span data-testid="import-icon">Import</span>}
        confirmVariant="default"
      />,
    )

    expect(await screen.findByTestId("import-icon")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Import" })).toHaveAttribute(
      "data-variant",
      "default",
    )
  })
})
