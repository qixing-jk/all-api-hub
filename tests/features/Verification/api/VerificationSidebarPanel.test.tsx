import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createRef } from "react"
import { expect, it, vi } from "vitest"

import Tooltip from "~/components/Tooltip"
import { VerificationSidebarPanel } from "~/features/Verification/api/VerificationSidebarPanel"

it("dismisses the current hint before closing its settings drawer", async () => {
  const user = userEvent.setup()
  const onClose = vi.fn()
  const toggleRef = createRef<HTMLButtonElement>()
  render(
    <div className="verification-workspace-frame">
      <button ref={toggleRef}>Settings</button>
      <VerificationSidebarPanel
        side="right"
        title="Configuration"
        id="configuration"
        open
        isWide={false}
        preparing={false}
        onClose={onClose}
        toggleRef={toggleRef}
        animate={false}
      >
        <Tooltip content={<p>Length rules</p>} anchorAsChild openOnClick>
          <button>Plan help</button>
        </Tooltip>
      </VerificationSidebarPanel>
    </div>,
  )
  const anchor = screen.getByRole("button", { name: "Plan help" })
  await user.click(anchor)
  await waitFor(() => expect(screen.getByRole("tooltip")).toBeVisible())
  await user.keyboard("{Escape}")
  await waitFor(() =>
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument(),
  )
  expect(onClose).not.toHaveBeenCalled()
  expect(anchor).toHaveFocus()
  await user.keyboard("{Escape}")
  expect(onClose).toHaveBeenCalledOnce()
})

it("preserves credential focus and selection when preparation becomes a drawer", () => {
  const toggleRef = createRef<HTMLButtonElement>()
  const panel = (preparing: boolean) => (
    <div className="verification-workspace-frame">
      <VerificationSidebarPanel
        side="right"
        title="Configuration"
        id="configuration"
        open
        isWide={false}
        preparing={preparing}
        onClose={() => {}}
        toggleRef={toggleRef}
        animate={false}
      >
        <input aria-label="URL" defaultValue="https://example.com" />
        <input aria-label="API key" defaultValue="draft-key" />
      </VerificationSidebarPanel>
    </div>
  )
  const { rerender } = render(panel(true))
  const input = screen.getByRole("textbox", {
    name: "API key",
    hidden: true,
  }) as HTMLInputElement
  input.focus()
  input.setSelectionRange(1, 5)
  rerender(panel(false))
  expect(screen.getByRole("textbox", { name: "API key" })).toBe(input)
  expect(input).toHaveFocus()
  expect(input.selectionStart).toBe(1)
  expect(input.selectionEnd).toBe(5)
})
