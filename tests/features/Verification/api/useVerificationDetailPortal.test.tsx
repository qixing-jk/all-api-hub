import { render, screen } from "@testing-library/react"
import { createPortal } from "react-dom"
import { expect, it } from "vitest"

import { useVerificationDetailPortal } from "~/features/Verification/api/useVerificationDetailPortal"

it("keeps the focused editor and selection when its responsive target changes", () => {
  function Editor({ target }: { target: HTMLElement }) {
    const { detailContainer, attachDetailParking } =
      useVerificationDetailPortal(target)
    return (
      <>
        <div ref={attachDetailParking} />
        {createPortal(
          <textarea aria-label="Prompt" defaultValue="Draft prompt" />,
          detailContainer,
        )}
      </>
    )
  }
  const wide = document.createElement("div")
  const narrow = document.createElement("div")
  document.body.append(wide, narrow)
  try {
    const { rerender } = render(<Editor target={wide} />)
    const input = screen.getByRole("textbox", {
      name: "Prompt",
    }) as HTMLTextAreaElement
    input.focus()
    input.setSelectionRange(2, 7, "backward")
    rerender(<Editor target={narrow} />)
    expect(input).toHaveFocus()
    expect(input.selectionStart).toBe(2)
    expect(input.selectionEnd).toBe(7)
    expect(input.selectionDirection).toBe("backward")
    expect(input).toHaveValue("Draft prompt")
  } finally {
    wide.remove()
    narrow.remove()
  }
})
