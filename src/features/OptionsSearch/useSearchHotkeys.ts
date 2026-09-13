import { useEffect } from "react"

interface UseSearchHotkeysOptions {
  onOpen: () => void
}

/**
 * Returns whether the current event target is an editable element.
 */
function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  )
}

/**
 * Registers the global keyboard shortcut that opens the options search dialog.
 */
export function useSearchHotkeys({ onOpen }: UseSearchHotkeysOptions) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k") {
        return
      }

      if (!(event.metaKey || event.ctrlKey)) {
        return
      }

      if (isEditableTarget(event.target)) {
        return
      }

      event.preventDefault()
      onOpen()
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [onOpen])
}
