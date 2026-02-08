import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"

const SCROLL_EDGE_EPSILON_PX = 2
const DEFAULT_SCROLL_STEP_RATIO = 0.75
const MIN_SCROLL_STEP_PX = 160

export interface HorizontalScrollControlsOptions {
  /**
   * Enables translating vertical wheel scroll into horizontal scrolling when the
   * cursor is over the scroll container.
   */
  enableWheelScroll?: boolean

  /**
   * Optional override for the scroll step in pixels when clicking arrow buttons.
   * When omitted, the step is computed from `scrollStepRatio` and clamped by
   * `MIN_SCROLL_STEP_PX`.
   */
  scrollStepPx?: number

  /**
   * When `scrollStepPx` is not provided, clicking an arrow scrolls by this ratio
   * of the container width.
   */
  scrollStepRatio?: number
}

/**
 * `useHorizontalScrollControls` manages horizontal scroll state for an overflow-x
 * container. It exposes:
 * - `canScrollLeft` / `canScrollRight` booleans for rendering arrow indicators
 * - `scrollLeft` / `scrollRight` helpers for arrow button actions
 * - `scrollChildIntoCenter` for keeping the selected tab visible/centered
 */
export function useHorizontalScrollControls<TElement extends HTMLElement>(
  options: HorizontalScrollControlsOptions = {},
) {
  const { enableWheelScroll = false, scrollStepPx, scrollStepRatio } = options
  const scrollRef = useRef<TElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current
    if (!el || el.clientWidth <= 0) {
      setCanScrollLeft(false)
      setCanScrollRight(false)
      return
    }

    const maxScrollLeft = Math.max(0, el.scrollWidth - el.clientWidth)
    const clampedScrollLeft = Math.max(
      0,
      Math.min(el.scrollLeft, maxScrollLeft),
    )

    setCanScrollLeft(clampedScrollLeft > SCROLL_EDGE_EPSILON_PX)
    setCanScrollRight(
      maxScrollLeft - clampedScrollLeft > SCROLL_EDGE_EPSILON_PX,
    )
  }, [])

  useLayoutEffect(() => {
    updateScrollState()
  }, [updateScrollState])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    let rafId: number | null = null
    const scheduleUpdate = () => {
      if (rafId != null) return
      rafId = window.requestAnimationFrame(() => {
        rafId = null
        updateScrollState()
      })
    }

    el.addEventListener("scroll", scheduleUpdate, { passive: true })
    window.addEventListener("resize", updateScrollState)

    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => scheduleUpdate())
      resizeObserver.observe(el)
    }

    return () => {
      el.removeEventListener("scroll", scheduleUpdate)
      window.removeEventListener("resize", updateScrollState)
      resizeObserver?.disconnect()
      if (rafId != null) {
        window.cancelAnimationFrame(rafId)
      }
    }
  }, [updateScrollState])

  useEffect(() => {
    if (!enableWheelScroll) return
    const el = scrollRef.current
    if (!el) return

    const onWheel = (event: WheelEvent) => {
      const maxScrollLeft = Math.max(0, el.scrollWidth - el.clientWidth)
      if (maxScrollLeft <= 0) return

      const delta =
        Math.abs(event.deltaX) > Math.abs(event.deltaY)
          ? event.deltaX
          : event.deltaY
      if (delta === 0) return

      const targetLeft = Math.max(
        0,
        Math.min(el.scrollLeft + delta, maxScrollLeft),
      )
      const didScroll = targetLeft !== el.scrollLeft

      if (didScroll) {
        event.preventDefault()
        el.scrollLeft = targetLeft
      }
    }

    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [enableWheelScroll])

  const scrollByStep = useCallback(
    (direction: "left" | "right") => {
      const el = scrollRef.current
      if (!el) return

      const computedStep = Math.max(
        MIN_SCROLL_STEP_PX,
        Math.floor(
          el.clientWidth * (scrollStepRatio ?? DEFAULT_SCROLL_STEP_RATIO),
        ),
      )
      const step = scrollStepPx ?? computedStep
      const delta = direction === "left" ? -step : step
      const targetLeft = el.scrollLeft + delta
      if (typeof el.scrollBy === "function") {
        el.scrollBy({ left: delta, behavior: "auto" })
      } else if (typeof el.scrollTo === "function") {
        el.scrollTo({ left: targetLeft, behavior: "auto" })
      } else {
        el.scrollLeft = targetLeft
        updateScrollState()
      }
    },
    [scrollStepPx, scrollStepRatio, updateScrollState],
  )

  const scrollLeft = useCallback(() => scrollByStep("left"), [scrollByStep])
  const scrollRight = useCallback(() => scrollByStep("right"), [scrollByStep])

  const scrollChildIntoCenter = useCallback(
    (childIndex: number) => {
      const el = scrollRef.current
      if (!el || el.clientWidth <= 0) return

      const children = el.children
      if (childIndex < 0 || childIndex >= children.length) return

      const child = children[childIndex] as HTMLElement
      const containerRect = el.getBoundingClientRect()
      const childRect = child.getBoundingClientRect()

      const childLeft = childRect.left - containerRect.left + el.scrollLeft
      const targetScrollLeft =
        childLeft - el.clientWidth / 2 + childRect.width / 2
      const resolvedLeft = Math.max(0, targetScrollLeft)
      if (typeof el.scrollTo === "function") {
        el.scrollTo({ left: resolvedLeft, behavior: "smooth" })
      } else {
        el.scrollLeft = resolvedLeft
        updateScrollState()
      }
    },
    [updateScrollState],
  )

  return {
    scrollRef,
    canScrollLeft,
    canScrollRight,
    updateScrollState,
    scrollLeft,
    scrollRight,
    scrollChildIntoCenter,
  }
}
