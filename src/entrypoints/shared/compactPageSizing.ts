import {
  isDesktopDevice,
  isExtensionPopup,
  isExtensionSidePanel,
} from "~/utils/browser"

const MIN_WIDTH_PROPERTY = "--extension-surface-min-width"
const INITIAL_MIN_WIDTH_PX = 320
const MIN_INITIAL_VIEWPORT_WIDTH_PX = 64

/** Seed mobile content-sized hosts before app modules without changing desktops. */
export function initializeCompactPageSizing() {
  if (!isExtensionPopup() && !isExtensionSidePanel()) return

  const mobileHint = (
    navigator as Navigator & { userAgentData?: { mobile?: boolean } }
  ).userAgentData?.mobile
  // Touch/screen heuristics can classify a Windows laptop as a tablet when
  // client hints are unavailable. Keep explicit desktop platforms unchanged.
  const desktopPlatform =
    /Windows NT|X11|CrOS/i.test(navigator.userAgent) &&
    !/Android/i.test(navigator.userAgent)
  if (isDesktopDevice() || (desktopPlatform && mobileHint !== true)) return

  const root = document.documentElement
  let hasUsableViewport = false
  const syncMinWidth = () => {
    const width = window.innerWidth
    // An initial sliver can be the host measuring its own content. Once the
    // host has resolved a usable width, honor subsequent zoom/resizes fully.
    if (width >= MIN_INITIAL_VIEWPORT_WIDTH_PX) hasUsableViewport = true
    if (!hasUsableViewport || width <= 0) return
    const minWidth = `${Math.min(INITIAL_MIN_WIDTH_PX, width)}px`
    if (root.style.getPropertyValue(MIN_WIDTH_PROPERTY) !== minWidth) {
      root.style.setProperty(MIN_WIDTH_PROPERTY, minWidth)
    }
  }

  root.setAttribute("data-compact-extension-page", "mobile")
  syncMinWidth()
  window.addEventListener("resize", syncMinWidth)
}
