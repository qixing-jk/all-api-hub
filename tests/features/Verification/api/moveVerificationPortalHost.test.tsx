import { afterEach, describe, expect, it, vi } from "vitest"

import { moveVerificationPortalHost } from "~/features/Verification/api/moveVerificationPortalHost"

/** Keep real DOM focus and selection while varying the browser move capability. */
function createEditorFixture(tagName: "input" | "textarea" = "textarea") {
  const container = document.createElement("div")
  const source = document.createElement("div")
  const target = document.createElement("div")
  const host = document.createElement("div")
  const editor = document.createElement(tagName)
  editor.value = "Keep this selected text"
  host.appendChild(editor)
  source.appendChild(host)
  container.append(source, target)
  document.body.appendChild(container)
  editor.focus()
  editor.setSelectionRange(5, 9, "backward")
  return { container, source, target, host, editor }
}

describe("moveVerificationPortalHost", () => {
  afterEach(() => {
    document.body.replaceChildren()
    vi.restoreAllMocks()
  })

  it.each(["input", "textarea"] as const)(
    "preserves the focused %s selection when native movement resets it",
    (tagName) => {
      const { target, host, editor } = createEditorFixture(tagName)
      // Model Chrome 144: the native move retains focus but collapses selection.
      const moveBefore = vi.fn((node: Node, child: Node | null) => {
        target.insertBefore(node, child)
        editor.focus()
        editor.setSelectionRange(0, 0)
      })
      Object.defineProperty(target, "moveBefore", { value: moveBefore })

      moveVerificationPortalHost(host, target)

      expect(moveBefore).toHaveBeenCalledWith(host, null)
      expect(host.parentElement).toBe(target)
      expect(document.activeElement).toBe(editor)
      expect(editor.value).toBe("Keep this selected text")
      expect(editor.selectionStart).toBe(5)
      expect(editor.selectionEnd).toBe(9)
      expect(editor.selectionDirection).toBe("backward")
    },
  )

  it("preserves focus and selection when native movement is unavailable", () => {
    const { target, host, editor } = createEditorFixture()
    Object.defineProperty(target, "moveBefore", { value: undefined })

    moveVerificationPortalHost(host, target)

    expect(host.parentElement).toBe(target)
    expect(document.activeElement).toBe(editor)
    expect(editor.selectionStart).toBe(5)
    expect(editor.selectionEnd).toBe(9)
    expect(editor.selectionDirection).toBe("backward")
  })

  it.each(["source", "target"] as const)(
    "moves the editor with appendChild when the %s is disconnected",
    (disconnectedSide) => {
      const { source, target, host, editor } = createEditorFixture()
      const moveBefore = vi.fn(() => {
        throw new DOMException(
          "Cannot preserve state across connection changes",
        )
      })
      Object.defineProperty(target, "moveBefore", { value: moveBefore })
      const disconnected = disconnectedSide === "source" ? source : target
      disconnected.remove()

      moveVerificationPortalHost(host, target)

      expect(moveBefore).not.toHaveBeenCalled()
      expect(host.parentElement).toBe(target)
      expect(target.contains(editor)).toBe(true)
      expect(editor.value).toBe("Keep this selected text")
      expect(host.isConnected).toBe(disconnectedSide === "source")
    },
  )
})
