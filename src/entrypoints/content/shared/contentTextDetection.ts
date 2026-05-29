import { isEventFromAllApiHubContentUi } from "./contentUi"

/**
 * Reads the current document selection as trimmed plain text.
 */
export function getSelectedText(): string {
  return window.getSelection()?.toString().trim() || ""
}

/**
 * Extracts text from a copy/cut event, preferring the active selection.
 */
export function getClipboardEventText(event: ClipboardEvent): string {
  return getSelectedText() || event.clipboardData?.getData("text").trim() || ""
}

/**
 * Registers synchronous pointerup selection-end detection and returns cleanup.
 */
export function registerSelectionEndTextDetection(
  onText: (sourceText: string) => void,
): () => void {
  const handlePointerUp = (event: PointerEvent) => {
    if (isEventFromAllApiHubContentUi(event.target)) {
      return
    }

    const selectedText = getSelectedText()
    if (selectedText) {
      onText(selectedText)
    }
  }

  document.addEventListener("pointerup", handlePointerUp, true)

  return () => {
    document.removeEventListener("pointerup", handlePointerUp, true)
  }
}
