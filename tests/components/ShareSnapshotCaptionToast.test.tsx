import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { ShareSnapshotCaptionToast } from "~/features/ShareSnapshots/components/ShareSnapshotCaptionToast"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

describe("ShareSnapshotCaptionToast", () => {
  it("disables copy button while copying and ignores concurrent clicks", async () => {
    const user = userEvent.setup()

    let resolveCopy: () => void = () => {}
    const onCopy = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveCopy = () => resolve()
        }),
    )

    render(
      <ShareSnapshotCaptionToast
        caption="hello"
        hint="hint"
        copyLabel="Copy"
        copyingLabel="Copying..."
        closeLabel="Close"
        onCopy={onCopy}
        onClose={vi.fn()}
      />,
    )

    const copyButton = await screen.findByRole("button", { name: "Copy" })
    expect(copyButton).not.toBeDisabled()

    await user.click(copyButton)
    expect(onCopy).toHaveBeenCalledTimes(1)
    expect(copyButton).toBeDisabled()
    expect(copyButton).toHaveAttribute("aria-busy", "true")
    expect(copyButton).toHaveAccessibleName("Copying...")
    const closeButton = screen.getByRole("button", { name: "Close" })
    expect(closeButton).toBeEnabled()
    expect(closeButton).not.toHaveAttribute("aria-busy")

    await user.click(copyButton)
    expect(onCopy).toHaveBeenCalledTimes(1)

    resolveCopy()

    await waitFor(() => {
      expect(copyButton).not.toBeDisabled()
    })
    expect(copyButton).not.toHaveAttribute("aria-busy")
  })

  it("surfaces errors when onCopy rejects", async () => {
    const user = userEvent.setup()
    const onCopy = vi.fn().mockRejectedValue(new Error("copy denied"))

    render(
      <ShareSnapshotCaptionToast
        caption="hello"
        hint="hint"
        copyLabel="Copy"
        copyingLabel="Copying..."
        closeLabel="Close"
        onCopy={onCopy}
        onClose={vi.fn()}
      />,
    )

    await user.click(await screen.findByRole("button", { name: "Copy" }))

    expect(onCopy).toHaveBeenCalledTimes(1)
    expect(await screen.findByText("copy denied")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Copy" })).not.toBeDisabled()
    expect(screen.getByRole("button", { name: "Copy" })).not.toHaveAttribute(
      "aria-busy",
    )
  })
})
