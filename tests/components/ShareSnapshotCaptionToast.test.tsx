import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { ShareSnapshotCaptionToast } from "~/features/ShareSnapshots/components/ShareSnapshotCaptionToast"
import { render, screen, waitFor } from "~/tests/test-utils/render"

describe("ShareSnapshotCaptionToast", () => {
  it("disables copy button while copying and ignores concurrent clicks", async () => {
    const user = userEvent.setup()

    let resolveCopy: (() => void) | null = null
    const onCopy = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveCopy = resolve
        }),
    )

    render(
      <ShareSnapshotCaptionToast
        caption="hello"
        hint="hint"
        copyLabel="Copy"
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

    await user.click(copyButton)
    expect(onCopy).toHaveBeenCalledTimes(1)

    resolveCopy?.()

    await waitFor(() => {
      expect(copyButton).not.toBeDisabled()
    })
  })

  it("surfaces errors when onCopy rejects", async () => {
    const user = userEvent.setup()
    const onCopy = vi.fn().mockRejectedValue(new Error("copy denied"))

    render(
      <ShareSnapshotCaptionToast
        caption="hello"
        hint="hint"
        copyLabel="Copy"
        closeLabel="Close"
        onCopy={onCopy}
        onClose={vi.fn()}
      />,
    )

    await user.click(await screen.findByRole("button", { name: "Copy" }))

    expect(onCopy).toHaveBeenCalledTimes(1)
    expect(await screen.findByText("copy denied")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Copy" })).not.toBeDisabled()
  })
})
