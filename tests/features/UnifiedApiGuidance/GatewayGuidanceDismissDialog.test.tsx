import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { GatewayGuidanceDismissDialog } from "~/features/UnifiedApiGuidance"
import { render, screen } from "~~/tests/test-utils/render"

describe("GatewayGuidanceDismissDialog", () => {
  it("shows a caller-provided safe error without closing the dialog", () => {
    render(
      <GatewayGuidanceDismissDialog
        isOpen
        title="Hide guidance"
        description="Hide this guidance permanently."
        cancelLabel="Cancel"
        confirmLabel="Hide"
        errorMessage="Could not save this change."
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
      {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    expect(
      screen.getByRole("alert", { name: "Could not save this change." }),
    ).toBeVisible()
    expect(screen.getByRole("dialog", { name: "Hide guidance" })).toBeVisible()
  })

  it("notifies the caller when the open dialog is dismissed", async () => {
    const onClose = vi.fn()
    render(
      <GatewayGuidanceDismissDialog
        isOpen
        title="Hide guidance"
        description="Hide this guidance permanently."
        cancelLabel="Cancel"
        confirmLabel="Hide"
        onClose={onClose}
        onConfirm={vi.fn()}
      />,
      {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    await userEvent.keyboard("{Escape}")

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
