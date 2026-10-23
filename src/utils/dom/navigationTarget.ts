import { resolveNavigationScrollBehavior } from "~/utils/dom/scrollBehavior"
import {
  temporarilyHighlight,
  type TemporaryHighlightOptions,
} from "~/utils/dom/temporaryHighlight"

/** Scroll a navigation destination without animating when reduced motion is requested. */
export function scrollToNavigationTarget(
  element: HTMLElement,
  options: ScrollIntoViewOptions = {},
) {
  element.scrollIntoView?.({
    ...options,
    behavior: resolveNavigationScrollBehavior(options.behavior),
    block: options.block ?? "start",
  })
}

/** Reveal a ready destination; return cleanup for the temporary highlight it owns. */
export function revealNavigationTarget(
  element: HTMLElement,
  {
    focus = false,
    highlight = false,
    behavior = "auto",
    ...scrollOptions
  }: ScrollIntoViewOptions & {
    focus?: boolean
    highlight?: boolean | TemporaryHighlightOptions
  } = {},
) {
  scrollToNavigationTarget(element, { ...scrollOptions, behavior })
  if (focus) element.focus({ preventScroll: true })
  return highlight
    ? temporarilyHighlight(element, highlight === true ? {} : highlight)
    : () => {}
}
