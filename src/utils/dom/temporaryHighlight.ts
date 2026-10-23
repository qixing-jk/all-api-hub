const HIGHLIGHT_CLASSES = [
  "ring-2",
  "ring-theme-500",
  "ring-offset-2",
  "ring-offset-background",
  "dark:ring-offset-surface-subtle",
]

const activeHighlights = new WeakMap<HTMLElement, () => void>()
const DEFAULT_HIGHLIGHT_DURATION_MS = 1800

export interface TemporaryHighlightOptions {
  durationMs?: number
  /** Render an existing feature-specific highlight instead of the default ring. */
  onChange?: (active: boolean) => void
}

/** Briefly identify a navigation target; a repeated request restarts its lifetime. */
export function temporarilyHighlight(
  element: HTMLElement,
  {
    durationMs = DEFAULT_HIGHLIGHT_DURATION_MS,
    onChange,
  }: TemporaryHighlightOptions = {},
) {
  activeHighlights.get(element)?.()
  const addedClasses = onChange
    ? []
    : HIGHLIGHT_CLASSES.filter(
        (className) => !element.classList.contains(className),
      )
  element.classList.add(...addedClasses)
  const clear = () => {
    if (activeHighlights.get(element) !== clear) return
    window.clearTimeout(timer)
    element.classList.remove(...addedClasses)
    activeHighlights.delete(element)
    onChange?.(false)
  }
  activeHighlights.set(element, clear)
  const timer = window.setTimeout(clear, durationMs)
  onChange?.(true)
  return clear
}
