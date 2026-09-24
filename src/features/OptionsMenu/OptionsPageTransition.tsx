import {
  AnimatePresence,
  motion,
  useAnimate,
  usePresence,
  usePresenceData,
} from "framer-motion"
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
import {
  PAGE_MOTION_OFFSET,
  usePageEntranceMotion,
} from "~/hooks/usePageEntranceMotion"

interface OptionsPageTransitionProps {
  pageId: string
  fallback: ReactNode
  children: ReactNode
}

const ENTER_DURATION = 0.3
const EXIT_DURATION = 0.17
const ENTER_EASE = [0.22, 1, 0.36, 1] as const
const EXIT_EASE = [0.4, 0, 1, 1] as const
const LOADER_DELAY_MS = 700
type AnimationControl = ReturnType<ReturnType<typeof useAnimate>[1]>

/** Uses the same order as the sidebar for vertical navigation direction. */
export function getOptionsPageDirection(from: string, to: string) {
  const pageIds = getOptionsPageMenuIds()
  const fromIndex = pageIds.findIndex((id) => id === from)
  const toIndex = pageIds.findIndex((id) => id === to)

  return fromIndex >= 0 && toIndex >= 0 && toIndex < fromIndex ? -1 : 1
}

/** Keeps the old page mounted until its content has left the main area. */
export function OptionsPageTransition({
  pageId,
  fallback,
  children,
}: OptionsPageTransitionProps) {
  const previousPageId = useRef(pageId)
  const direction = useRef(1)

  if (previousPageId.current !== pageId) {
    direction.current = getOptionsPageDirection(previousPageId.current, pageId)
    previousPageId.current = pageId
  }

  return (
    <AnimatePresence mode="wait" initial={false} custom={direction.current}>
      <AnimatedOptionsPage
        key={pageId}
        direction={direction.current}
        fallback={fallback}
      >
        {children}
      </AnimatedOptionsPage>
    </AnimatePresence>
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
  children,
}: {
  direction: number
  fallback: ReactNode
  children: ReactNode
}) {
  const [scope, animate] = useAnimate<HTMLDivElement>()
  const [isPresent, safeToRemove] = usePresence()
  const exitDirection = usePresenceData() as number | undefined
  const { shouldReduceMotion } = usePageEntranceMotion()
  const content = useRef<HTMLDivElement>(null)
  const started = useRef(false)
  const ready = useRef(false)
  const loaderMounted = useRef(false)
  const [showLoader, setShowLoader] = useState(false)
  const [contentVisible, setContentVisible] = useState(false)
  const entrance = useRef<AnimationControl[]>([])
  const pendingObserver = useRef<MutationObserver | null>(null)

  const startEntrance = useCallback(() => {
    if (started.current || !isPresent || !content.current) return
    started.current = true
    if (shouldReduceMotion) {
      content.current.style.opacity = "1"
      setContentVisible(true)
      return
    }

    const targets = getPageMotionTargets(content.current)
    const interval = staggerInterval(targets.length, 0.06, 0.24)
    const ordered = direction > 0 ? targets : [...targets].reverse()

    targets.forEach((target) => {
      target.style.opacity = "0"
    })
    content.current.style.opacity = "1"
    setContentVisible(true)
    entrance.current = ordered.map((target, index) =>
      animate(
        target,
        { opacity: [0, 1], y: [direction * PAGE_MOTION_OFFSET, 0] },
        {
          duration: ENTER_DURATION,
          ease: ENTER_EASE,
          delay: index * interval,
        },
      ),
    )
  }, [animate, direction, isPresent, shouldReduceMotion])

  const onPageReady = useCallback(() => {
    if (!isPresent || !content.current || ready.current) return
    if (content.current.querySelector("[data-options-page-pending]")) {
      if (!pendingObserver.current) {
        pendingObserver.current = new MutationObserver(onPageReady)
        pendingObserver.current.observe(content.current, {
          attributes: true,
          attributeFilter: ["data-options-page-pending"],
          childList: true,
          subtree: true,
        })
      }
      return
    }
    pendingObserver.current?.disconnect()
    pendingObserver.current = null
    ready.current = true
    setShowLoader(false)
    if (!loaderMounted.current || shouldReduceMotion) startEntrance()
  }, [isPresent, shouldReduceMotion, startEntrance])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (!ready.current && isPresent) setShowLoader(true)
    }, LOADER_DELAY_MS)
    return () => window.clearTimeout(timeout)
  }, [isPresent])

  useLayoutEffect(() => {
    if (isPresent || !safeToRemove) return
    pendingObserver.current?.disconnect()
    pendingObserver.current = null
    entrance.current.forEach((control) => control.stop())
    if (!started.current || shouldReduceMotion || !content.current) {
      safeToRemove()
      return
    }

    const targets = getPageMotionTargets(content.current)
    if (targets.length === 0) {
      safeToRemove()
      return
    }

    const movingDown = (exitDirection ?? direction) > 0
    const ordered = movingDown ? targets : [...targets].reverse()
    const interval = staggerInterval(ordered.length, 0.03, 0.09)
    const departure = ordered.map((target, index) =>
      animate(
        target,
        {
          opacity: 0,
          y: movingDown ? -PAGE_MOTION_OFFSET : PAGE_MOTION_OFFSET,
        },
        { duration: EXIT_DURATION, ease: EXIT_EASE, delay: index * interval },
      ),
    )
    void Promise.all(departure).then(safeToRemove)

    return () => departure.forEach((control) => control.stop())
  }, [
    animate,
    direction,
    exitDirection,
    isPresent,
    safeToRemove,
    shouldReduceMotion,
  ])

  return (
    <div ref={scope} className="relative min-w-0" aria-hidden={!isPresent}>
      <div ref={content} style={{ opacity: contentVisible ? 1 : 0 }}>
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
    .filter((block) => {
      const rect = block.getBoundingClientRect()
      return rect.bottom > -20 && rect.top < window.innerHeight + 20
    })
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
