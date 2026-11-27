import { scrollToAccessTokenCue } from "./scroll"
import { matchesAccessTokenCueSite } from "./siteBoundary"
import { findAccessTokenCueTarget } from "./targets"

const HIGHLIGHT_ATTRIBUTE = "data-all-api-hub-highlight"
const HIGHLIGHT_VALUE = "access-token"
const HIGHLIGHT_PRIORITY = "important"
const HIGHLIGHT_DURATION_MS = 3600
const TARGET_WAIT_MS = 5000
const TARGET_OBSERVER_OPTIONS = {
  attributeFilter: [
    "aria-hidden",
    "aria-label",
    "aria-labelledby",
    "class",
    "data-slot",
    "hidden",
    "style",
  ],
  characterData: true,
  childList: true,
  subtree: true,
}
const HIGHLIGHT_STYLES = {
  "outline-color": "Highlight",
  "outline-style": "solid",
  "outline-width": "3px",
  "outline-offset": "2px",
  "box-shadow": "0 0 0 3px HighlightText, 0 0 10px 2px Highlight",
}
let clearActiveCue: (() => void) | undefined

type CueTarget = NonNullable<ReturnType<typeof findAccessTokenCueTarget>>

/** Waits briefly for the SPA to render its token controls. */
function waitForTarget() {
  return new Promise<CueTarget | undefined>((resolve) => {
    const finish = (target?: CueTarget) => {
      clearTimeout(timer)
      observer.disconnect()
      window.removeEventListener("pagehide", cancel)
      resolve(target)
    }
    const cancel = () => finish()
    const observer = new MutationObserver(() => {
      const target = findAccessTokenCueTarget()
      if (target) finish(target)
    })
    const timer = setTimeout(cancel, TARGET_WAIT_MS)
    observer.observe(document.documentElement, TARGET_OBSERVER_OPTIONS)
    window.addEventListener("pagehide", cancel, { once: true })
  })
}

/** Adds a temporary outline and restores the host's attributes on cleanup. */
function mark(element: HTMLElement) {
  const style = element.style
  const originalStyle = element.getAttribute("style")
  const previousMarker = element.getAttribute(HIGHLIGHT_ATTRIBUTE)
  // Snapshot the declarations before editing any longhands of a shorthand.
  const declarations = Object.entries(HIGHLIGHT_STYLES).map(
    ([property, value]) => ({
      property,
      value,
      previousValue: style.getPropertyValue(property),
      priority: style.getPropertyPriority(property),
    }),
  )
  for (const { property, value } of declarations)
    style.setProperty(property, value, HIGHLIGHT_PRIORITY)
  const appliedStyle = element.getAttribute("style")
  const appliedDeclarations = declarations.map((declaration) => ({
    ...declaration,
    appliedValue: style.getPropertyValue(declaration.property),
  }))
  element.setAttribute(HIGHLIGHT_ATTRIBUTE, HIGHLIGHT_VALUE)
  return () => {
    if (element.getAttribute("style") === appliedStyle) {
      if (originalStyle === null) element.removeAttribute("style")
      else element.setAttribute("style", originalStyle)
    } else {
      for (const {
        property,
        previousValue,
        priority,
        appliedValue,
      } of appliedDeclarations) {
        if (
          style.getPropertyValue(property) !== appliedValue ||
          style.getPropertyPriority(property) !== HIGHLIGHT_PRIORITY
        )
          continue
        if (previousValue) style.setProperty(property, previousValue, priority)
        else style.removeProperty(property)
      }
      if (originalStyle === null && style.length === 0)
        element.removeAttribute("style")
    }
    if (element.getAttribute(HIGHLIGHT_ATTRIBUTE) !== HIGHLIGHT_VALUE) return
    if (previousMarker === null) element.removeAttribute(HIGHLIGHT_ATTRIBUTE)
    else element.setAttribute(HIGHLIGHT_ATTRIBUTE, previousMarker)
  }
}

/** Applies one cue per document and picks up a late-rendered token action. */
function show({ group, findAction }: CueTarget) {
  clearActiveCue?.()
  const action = findAction?.()
  const scrolling = scrollToAccessTokenCue(group, action)
  const restoreGroup = mark(group)
  let restoreAction = action ? mark(action) : undefined
  const actionObserver =
    findAction && !action
      ? new MutationObserver(() => {
          const button = findAction()
          if (!button) return
          actionObserver?.disconnect()
          restoreAction = mark(button)
          scrolling.setAction(button)
        })
      : undefined
  actionObserver?.observe(group, TARGET_OBSERVER_OPTIONS)
  const clear = () => {
    clearTimeout(timer)
    window.removeEventListener("pagehide", clear)
    scrolling.stop()
    actionObserver?.disconnect()
    restoreAction?.()
    restoreGroup()
    clearActiveCue = undefined
  }
  const timer = setTimeout(clear, HIGHLIGHT_DURATION_MS)
  window.addEventListener("pagehide", clear, { once: true })
  clearActiveCue = clear
}

/** Applies a visual cue in a matching top-level New API document. */
export async function showAccessTokenCue(openedSite: unknown) {
  if (
    window.top !== window ||
    !matchesAccessTokenCueSite(openedSite, window.location.href)
  )
    return
  const target = findAccessTokenCueTarget() ?? (await waitForTarget())
  if (target && matchesAccessTokenCueSite(openedSite, window.location.href))
    show(target)
}
