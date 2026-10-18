const HIGHLIGHT_CLASSES = [
  "ring-2",
  "ring-theme-500",
  "ring-offset-2",
  "ring-offset-background",
  "dark:ring-offset-surface-subtle",
]

const activeHighlights = new WeakMap<HTMLElement, () => void>()

/** Briefly identify a navigation target; a repeated request restarts its lifetime. */
export function temporarilyHighlight(element: HTMLElement) {
  activeHighlights.get(element)?.()
  const addedClasses = HIGHLIGHT_CLASSES.filter(
    (className) => !element.classList.contains(className),
  )
  element.classList.add(...addedClasses)
  const clear = () => {
    if (activeHighlights.get(element) !== clear) return
    window.clearTimeout(timer)
    element.classList.remove(...addedClasses)
    activeHighlights.delete(element)
  }
  activeHighlights.set(element, clear)
  const timer = window.setTimeout(clear, 1800)
  return clear
}
