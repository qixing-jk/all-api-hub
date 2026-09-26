import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useAnimate } from "framer-motion/mini"
import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"

import { getOptionsPageMenuIds } from "~/constants/optionsMenuDefinitions"

interface OptionsPageTransitionProps {
  pageId: string
  fallback: ReactNode
  children: ReactNode
}

const ENTER_DURATION = 0.3
const EXIT_DURATION = 0.17
const PAGE_MOTION_OFFSET = 14
const ENTER_EASE = [0.22, 1, 0.36, 1] as const
const EXIT_EASE = [0.4, 0, 1, 1] as const
const LOADER_DELAY_MS = 700
type AnimationControl = ReturnType<ReturnType<typeof useAnimate>[1]>

/** Uses the same order as the sidebar for vertical navigation direction. */
function getOptionsPageDirection(from: string, to: string) {
  const pageIds = getOptionsPageMenuIds()
  const fromIndex = pageIds.findIndex((id) => id === from)
  const toIndex = pageIds.findIndex((id) => id === to)

  return fromIndex >= 0 && toIndex >= 0 && toIndex < fromIndex ? -1 : 1
}

/** Finishes the current exit, then mounts the latest requested page. */
export function OptionsPageTransition({
  pageId,
  fallback,
  children,
}: OptionsPageTransitionProps) {
  const [displayed, setDisplayed] = useState({
    pageId,
    sequence: 0,
    direction: 1,
  })
  const [isExiting, setIsExiting] = useState(false)
  const [exitDirection, setExitDirection] = useState(1)
  const latestPage = useRef({ pageId, fallback, children })
  const displayedPage = useRef({ pageId, fallback, children })
  latestPage.current = { pageId, fallback, children }
  if (!isExiting && pageId === displayed.pageId) {
    displayedPage.current = latestPage.current
  }

  useLayoutEffect(() => {
    if (isExiting || pageId === displayed.pageId) return
    setExitDirection(getOptionsPageDirection(displayed.pageId, pageId))
    setIsExiting(true)
  }, [displayed.pageId, isExiting, pageId])

  const finishExit = useCallback(() => {
    const nextPageId = latestPage.current.pageId
    setDisplayed((previous) => ({
      pageId: nextPageId,
      sequence: previous.sequence + 1,
      direction: getOptionsPageDirection(previous.pageId, nextPageId),
    }))
    setIsExiting(false)
  }, [])

  const page =
    !isExiting && pageId === displayed.pageId
      ? latestPage.current
      : displayedPage.current

  return (
    <AnimatedOptionsPage
      key={`${displayed.pageId}:${displayed.sequence}`}
      direction={isExiting ? exitDirection : displayed.direction}
      fallback={page.fallback}
      isPresent={!isExiting}
      onExitComplete={finishExit}
    >
      {page.children}
    </AnimatedOptionsPage>
  )
}

/** Runs before the resolved lazy page is first painted. */
function ReadyPage({
  onReady,
  children,
}: {
  onReady: () => void
  children: ReactNode
}) {
  useLayoutEffect(() => {
    // Parent refs attach later in the same commit; the microtask still runs
    // before the browser paints the resolved page.
    queueMicrotask(onReady)
  }, [onReady])
  return <>{children}</>
}

/** Animates one route and controls when it may unmount. */
function AnimatedOptionsPage({
  direction,
  fallback,
  isPresent,
  onExitComplete,
  children,
}: {
  direction: number
  fallback: ReactNode
  isPresent: boolean
  onExitComplete: () => void
  children: ReactNode
}) {
  const [scope, animate] = useAnimate<HTMLDivElement>()
  const onExitCompleteRef = useRef(onExitComplete)
  onExitCompleteRef.current = onExitComplete
  const shouldReduceMotion = useReducedMotion()
  const content = useRef<HTMLDivElement>(null)
  const started = useRef(false)
  const prepared = useRef(false)
  const entranceFrame = useRef<number | null>(null)
  const ready = useRef(false)
  const loaderMounted = useRef(false)
  const [showLoader, setShowLoader] = useState(false)
  const [contentVisible, setContentVisible] = useState(false)
  const entrance = useRef<
    Array<{ target: HTMLElement; control: AnimationControl }>
  >([])
  const baseTransforms = useRef(new Map<HTMLElement, string>())
  const pendingObserver = useRef<MutationObserver | null>(null)
  const readyItemTimeout = useRef<number | null>(null)

  const startEntrance = useCallback(() => {
    if (started.current || !isPresent || !content.current) return
    started.current = true
    if (shouldReduceMotion) {
      content.current.style.opacity = "1"
      setContentVisible(true)
      return
    }

    // Let the resolved page commit and lay out before the first motion frame.
    entranceFrame.current = window.requestAnimationFrame(() => {
      if (!content.current) return
      const targets = getPageMotionTargets(content.current)
      const interval = staggerInterval(targets.length, 0.06, 0.24)
      const ordered = direction > 0 ? targets : [...targets].reverse()

      // Read the original transforms together before writing hidden styles.
      targets.forEach((target) => {
        baseTransforms.current.set(target, getComputedStyle(target).transform)
      })
      targets.forEach((target) => {
        target.style.opacity = "0"
      })
      prepared.current = true

      // Paint the prepared content separately from the data-heavy React commit.
      entranceFrame.current = window.requestAnimationFrame(() => {
        if (!content.current) return
        entranceFrame.current = null
        entrance.current = ordered.map((target, index) => {
          const base = baseTransforms.current.get(target) ?? "none"
          const control = animate(
            target,
            {
              opacity: [0, 1],
              transform: [
                translatedTransform(base, direction * PAGE_MOTION_OFFSET),
                base,
              ],
            },
            {
              duration: ENTER_DURATION,
              ease: ENTER_EASE,
              delay: index * interval,
            },
          )
          return { target, control }
        })
        // Mini creates native keyframes synchronously with fill: both and
        // commits the final styles before removing them, including on exit.
        content.current.style.opacity = "1"
        setContentVisible(true)
      })
    })
  }, [animate, direction, isPresent, shouldReduceMotion])

  const finishPageReady = useCallback(() => {
    if (ready.current || !isPresent) return
    pendingObserver.current?.disconnect()
    pendingObserver.current = null
    ready.current = true
    setShowLoader(false)
    if (!loaderMounted.current || shouldReduceMotion) startEntrance()
  }, [isPresent, shouldReduceMotion, startEntrance])

  const onPageReady = useCallback(() => {
    if (!isPresent || !content.current || ready.current) return
    const pendingData = content.current.querySelector(
      "[data-options-page-pending]",
    )
    const waitingForVisibleItem = Array.from(
      content.current.querySelectorAll<HTMLElement>(
        "[data-page-motion-wait-for]",
      ),
    ).some((group) => {
      const selector = group.dataset.pageMotionWaitFor
      return selector && !group.querySelector(selector)
    })
    if (pendingData || waitingForVisibleItem) {
      if (!pendingObserver.current) {
        pendingObserver.current = new MutationObserver(onPageReady)
        pendingObserver.current.observe(content.current, {
          attributes: true,
          attributeFilter: ["data-options-page-pending"],
          childList: true,
          subtree: true,
        })
      }
      if (
        !pendingData &&
        waitingForVisibleItem &&
        readyItemTimeout.current === null
      ) {
        readyItemTimeout.current = window.setTimeout(() => {
          readyItemTimeout.current = null
          finishPageReady()
        }, 450)
      }
      return
    }
    if (readyItemTimeout.current !== null) {
      window.clearTimeout(readyItemTimeout.current)
      readyItemTimeout.current = null
    }
    finishPageReady()
  }, [finishPageReady, isPresent])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (!ready.current && isPresent) setShowLoader(true)
    }, LOADER_DELAY_MS)
    return () => window.clearTimeout(timeout)
  }, [isPresent])

  useLayoutEffect(() => {
    return () => {
      if (readyItemTimeout.current !== null) {
        window.clearTimeout(readyItemTimeout.current)
        readyItemTimeout.current = null
      }
      pendingObserver.current?.disconnect()
      pendingObserver.current = null
      if (entranceFrame.current !== null) {
        window.cancelAnimationFrame(entranceFrame.current)
        entranceFrame.current = null
      }
      entrance.current.forEach(({ control }) => control.cancel())
    }
  }, [])

  useLayoutEffect(() => {
    if (isPresent) return
    if (readyItemTimeout.current !== null) {
      window.clearTimeout(readyItemTimeout.current)
      readyItemTimeout.current = null
    }
    pendingObserver.current?.disconnect()
    pendingObserver.current = null
    if (entranceFrame.current !== null) {
      window.cancelAnimationFrame(entranceFrame.current)
      entranceFrame.current = null
    }
    entrance.current.forEach(({ target, control }) => {
      // stop() commits the current styles, which requires a rendered target.
      // Settings tabs and conditional cards may disappear during entrance.
      if (target.isConnected && target.getClientRects().length > 0) {
        control.stop()
      } else {
        control.cancel()
      }
    })
    if (!prepared.current || shouldReduceMotion || !content.current) {
      onExitCompleteRef.current()
      return
    }

    const targets = getPageMotionTargets(content.current)
    if (targets.length === 0) {
      onExitCompleteRef.current()
      return
    }

    const movingDown = direction > 0
    const ordered = movingDown ? targets : [...targets].reverse()
    const interval = staggerInterval(ordered.length, 0.03, 0.09)
    const departureFrames = ordered.map((target) => {
      const style = getComputedStyle(target)
      return {
        opacity: [Number(style.opacity), 0],
        transform: [
          style.transform,
          translatedTransform(
            baseTransforms.current.get(target) ?? style.transform,
            movingDown ? -PAGE_MOTION_OFFSET : PAGE_MOTION_OFFSET,
          ),
        ],
      }
    })
    const departure = ordered.map((target, index) =>
      animate(target, departureFrames[index]!, {
        duration: EXIT_DURATION,
        ease: EXIT_EASE,
        delay: index * interval,
      }),
    )
    let completed = false
    let canceled = false
    const finishExit = () => {
      if (completed || canceled) return
      completed = true
      onExitCompleteRef.current()
    }
    const timeout = window.setTimeout(finishExit, 350)
    void Promise.all(departure).then(finishExit)

    return () => {
      canceled = true
      window.clearTimeout(timeout)
      departure.forEach((control) => control.cancel())
    }
  }, [animate, direction, isPresent, shouldReduceMotion])

  return (
    <div ref={scope} className="relative min-w-0" aria-hidden={!isPresent}>
      <div
        ref={content}
        data-options-page-content
        style={{ opacity: contentVisible ? 1 : 0 }}
      >
        <Suspense fallback={null}>
          <ReadyPage onReady={onPageReady}>{children}</ReadyPage>
        </Suspense>
      </div>
      <AnimatePresence
        onExitComplete={() => {
          loaderMounted.current = false
          if (ready.current) startEntrance()
        }}
      >
        {showLoader ? (
          <motion.div
            key="loading"
            ref={(node) => {
              if (node) loaderMounted.current = true
            }}
            data-options-page-fallback
            className="pointer-events-none absolute inset-x-0 top-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.16 }}
          >
            {fallback}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

/** Adds viewport-axis movement without changing the block's original transform. */
function translatedTransform(base: string, offset: number): string {
  return `translate3d(0, ${offset}px, 0)${base === "none" ? "" : ` ${base}`}`
}

/** Keeps the stagger visible without extending a busy page transition. */
function staggerInterval(
  count: number,
  preferred: number,
  maximumSpan: number,
) {
  return count <= 1 ? 0 : Math.min(preferred, maximumSpan / (count - 1))
}

/** Selects major blocks without animating their contents separately. */
function getPageMotionTargets(scope: HTMLElement): HTMLElement[] {
  const roots = visibleChildren(scope)
  const singleRoot = roots[0]
  const blocks =
    roots.length === 1 && singleRoot && !isAtomicBlock(singleRoot)
      ? visibleChildren(singleRoot)
      : roots

  return blocks
    .flatMap((block) => expandMotionGroup(block))
    .filter(isInMotionViewport)
    .sort((a, b) => {
      const aRect = a.getBoundingClientRect()
      const bRect = b.getBoundingClientRect()
      return Math.abs(aRect.top - bRect.top) > 8
        ? aRect.top - bRect.top
        : aRect.left - bRect.left
    })
}

/** Expands only declared page groups, keeping controls inside each card together. */
function expandMotionGroup(block: HTMLElement, depth = 0): HTMLElement[] {
  if (depth > 3 || isAtomicBlock(block)) return [block]
  if (block.dataset.pageMotionList !== undefined) {
    return Array.from(
      block.querySelectorAll<HTMLElement>("[data-page-motion-item]"),
    ).filter(isInMotionViewport)
  }
  const children = visibleChildren(block)
  if (block.dataset.pageMotionGroup !== undefined) {
    return children.flatMap((child) => expandMotionGroup(child, depth + 1))
  }
  return children.length > 1 &&
    children.every(
      (child) => child.tagName === "SECTION" || child.dataset.slot === "card",
    )
    ? children
    : [block]
}

/** Skips offscreen list rows so a long archive never animates all records. */
function isInMotionViewport(block: HTMLElement) {
  const rect = block.getBoundingClientRect()
  return rect.bottom > -20 && rect.top < window.innerHeight + 20
}

/** Treats a page header or card as one visual unit. */
function isAtomicBlock(element: HTMLElement) {
  return (
    element.dataset.pageMotionItem !== undefined ||
    element.dataset.slot === "card"
  )
}

/** Ignores hidden and floating content outside the main page flow. */
function visibleChildren(element: Element): HTMLElement[] {
  return Array.from(element.children).filter((child): child is HTMLElement => {
    if (!(child instanceof HTMLElement)) return false
    const style = getComputedStyle(child)
    const rect = child.getBoundingClientRect()
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.position !== "fixed" &&
      rect.width > 4 &&
      rect.height > 4
    )
  })
}
