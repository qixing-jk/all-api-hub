import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { ChannelEditorShell } from "~/components/dialogs/ChannelDialog/components/ChannelEditorShell"

describe("ChannelEditorShell", () => {
  it("preserves modal close and submit semantics", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault())

    render(
      <ChannelEditorShell
        isOpen
        title="Create channel"
        description="Configure common fields"
        onClose={onClose}
        onSubmit={onSubmit}
        submitLabel="Create"
        closeLabel="Cancel"
        submitTestId="channel-submit"
        isSubmitDisabled={false}
      >
        <label htmlFor="name">Name</label>
        <input id="name" />
      </ChannelEditorShell>,
    )

    const submit = screen.getByTestId("channel-submit")
    expect(submit).toHaveAccessibleName("Create")
    expect(screen.getByText("Create channel")).toHaveClass(
      "dark:text-dark-text-primary",
      "text-gray-900",
    )
    expect(screen.getByText("Configure common fields")).toHaveClass(
      "dark:text-dark-text-secondary",
      "text-gray-500",
    )
    await user.click(submit)
    expect(onSubmit).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole("button", { name: "Cancel" }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("blocks backdrop and escape closure while submitting", () => {
    render(
      <ChannelEditorShell
        isOpen
        title="Edit channel"
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        submitLabel="Updating"
        closeLabel="Cancel"
        isSubmitting
      >
        body
      </ChannelEditorShell>,
    )

    expect(screen.getByRole("button", { name: "Updating" })).toBeDisabled()
  })

  it("owns view-mode footer layout without rendering a submit action", () => {
    render(
      <ChannelEditorShell
        isOpen
        title="View channel"
        description="Review channel details"
        onClose={vi.fn()}
        onSubmit={(event) => event.preventDefault()}
        closeLabel="Close"
        showSubmit={false}
      >
        body
      </ChannelEditorShell>,
    )

    expect(screen.getByRole("button", { name: "Close" })).toBeVisible()
    expect(screen.queryByRole("button", { name: "Create" })).toBeNull()
    expect(screen.getAllByText("View channel")).toHaveLength(1)
  })
})
