import { resolveNavigationScrollBehavior } from "~/utils/dom/scrollBehavior"

const LAYOUT_DEBOUNCE_MS = 80
const LAYOUT_SHIFT_TOLERANCE_PX = 1
const VIEWPORT_INSET = 16
const USER_INTERACTIONS = ["wheel", "touchstart", "pointerdown", "keydown"]

/** Finds the nearest vertical scrolling region, including one yet to fill. */
function findScrollContainer(element: HTMLElement) {
  for (
    let parent = element.parentElement;
    parent;
    parent = parent.parentElement
  ) {
    const { overflowY } = window.getComputedStyle(parent)
    if (overflowY === "auto" || overflowY === "scroll") return parent
  }
  return document.scrollingElement ?? document.documentElement
}

/** Scrolls the card into view and follows brief layout shifts until user input. */
export function scrollToAccessTokenCue(
  group: HTMLElement,
  action?: HTMLElement,
) {
  const container = findScrollContainer(group)
  const isDocument =
    container === document.scrollingElement ||
    container === document.documentElement ||
    container === document.body
  const viewport = () => {
    if (isDocument) return { top: 0, bottom: window.innerHeight }
    const top = container.getBoundingClientRect().top + container.clientTop
    return {
      top: Math.max(0, top),
      bottom: Math.min(window.innerHeight, top + container.clientHeight),
    }
  }
  const bounds = viewport()
  const isTall =
    group.getBoundingClientRect().height >
    bounds.bottom - bounds.top - 2 * VIEWPORT_INSET
  let target = isTall && action ? action : group
  let block: ScrollLogicalPosition = isTall && !action ? "start" : "center"
  target.scrollIntoView({
    block,
    behavior: resolveNavigationScrollBehavior(),
  })

  const targetPosition = () =>
    target.getBoundingClientRect().top +
    (isDocument
      ? window.scrollY
      : container.scrollTop - container.getBoundingClientRect().top)
  let previousPosition = targetPosition()
  let stopped = false
  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  const scheduleRecenter = () => {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      if (!target.isConnected) {
        stop()
        return
      }
      const position = targetPosition()
      const shifted =
        Math.abs(position - previousPosition) > LAYOUT_SHIFT_TOLERANCE_PX
      previousPosition = position
      const bounds = viewport()
      const rect = target.getBoundingClientRect()
      const outside =
        rect.top < bounds.top + VIEWPORT_INSET ||
        Math.min(rect.bottom, rect.top + VIEWPORT_INSET) >
          bounds.bottom - VIEWPORT_INSET ||
        (!isTall && rect.bottom > bounds.bottom - VIEWPORT_INSET)
      if (shifted && outside)
        target.scrollIntoView({ block, behavior: "instant" })
    }, LAYOUT_DEBOUNCE_MS)
  }
  const mutations = new MutationObserver(scheduleRecenter)
  const sizes =
    typeof ResizeObserver === "function"
      ? new ResizeObserver(scheduleRecenter)
      : undefined
  const stop = () => {
    stopped = true
    clearTimeout(debounceTimer)
    mutations.disconnect()
    sizes?.disconnect()
    for (const event of USER_INTERACTIONS)
      window.removeEventListener(event, stop, true)
  }
  for (const event of USER_INTERACTIONS) {
    window.addEventListener(event, stop, {
      capture: true,
      passive: true,
      once: true,
    })
  }
  mutations.observe(document.body, { childList: true, subtree: true })
  if (group.parentElement) sizes?.observe(group.parentElement)
  sizes?.observe(container)
  return {
    stop,
    setAction(action: HTMLElement) {
      if (stopped || !isTall) return
      target = action
      block = "center"
      previousPosition = targetPosition()
      const bounds = viewport()
      const rect = action.getBoundingClientRect()
      if (rect.top < bounds.top || rect.bottom > bounds.bottom)
        action.scrollIntoView({
          block,
          behavior: resolveNavigationScrollBehavior(),
        })
    },
  }
}
