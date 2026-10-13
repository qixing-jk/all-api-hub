import {
  isExtensionPopup,
  isExtensionSidePanel,
  shouldSeedCompactPageWidth,
} from "~/utils/browser"

const MIN_WIDTH_PROPERTY = "--extension-surface-min-width"
const MOBILE_SEED_WIDTH_PX = 320
// Heuristic separating an initial host-measurement sliver from a usable
// viewport, not a responsive breakpoint. Preserve the existing 64px cutoff.
const INITIAL_VIEWPORT_READY_WIDTH_PX = 64

/** Seed mobile content-sized hosts before app modules without changing desktops. */
export function initializeCompactPageSizing() {
  if (!isExtensionPopup() && !isExtensionSidePanel()) return

  if (!shouldSeedCompactPageWidth()) return

  const root = document.documentElement
  let hasResolvedInitialViewport = false
  const syncViewportMinWidth = () => {
    const width = window.innerWidth
    // An initial sliver can be the host measuring its own content. Once the
    // host has resolved a usable width, honor subsequent zoom/resizes fully.
    if (width >= INITIAL_VIEWPORT_READY_WIDTH_PX) {
      hasResolvedInitialViewport = true
    }
    if (!hasResolvedInitialViewport || width <= 0) return
    const minWidth = `${Math.min(MOBILE_SEED_WIDTH_PX, width)}px`
    if (root.style.getPropertyValue(MIN_WIDTH_PROPERTY) !== minWidth) {
      root.style.setProperty(MIN_WIDTH_PROPERTY, minWidth)
    }
  }

  root.setAttribute("data-compact-extension-page", "mobile")
  syncViewportMinWidth()
  window.addEventListener("resize", syncViewportMinWidth)
}
