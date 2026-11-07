import { useLayoutEffect, useRef, useState } from "react"

const MIN_WORKSPACE_HEIGHT_PX = 160
const WORKSPACE_HEIGHT_ROUNDING_GUARD_PX = 1

/** Reserve the remaining dialog height independently of the selected content. */
export function useVerificationWorkspaceHeight(selectedId: string | null) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [isWide, setIsWide] = useState(false)

  useLayoutEffect(() => {
    const frame = frameRef.current
    const view = frame?.ownerDocument.defaultView
    const body = frame?.closest<HTMLElement>(
      '[data-slot="modal-body"], [data-verification-scroll]',
    )
    const shell = body?.closest<HTMLElement>(
      '[data-slot="modal-panel"], [role="dialog"]',
    )
    const detail = frame?.querySelector<HTMLElement>(
      "[data-verification-detail]:not([hidden])",
    )
    if (!frame || !view || !body || !shell || !detail) return

    const measure = () => {
      const detailStyle = view.getComputedStyle(detail)
      const wide = detailStyle.position === "absolute"
      setIsWide(wide)
      // Narrow layouts stay in normal document flow and keep a single scroll.
      if (!wide) return
      const limit = Number.parseFloat(view.getComputedStyle(shell).maxHeight)
      if (!Number.isFinite(limit)) return
      const chrome = shell.offsetHeight - body.clientHeight
      const otherContent = body.scrollHeight - frame.offsetHeight
      const bodyLimit = Math.max(0, limit - chrome)
      // If configuration alone fills the dialog, retain an operable test area
      // and let the outer form scroll instead of collapsing the tests to zero.
      const available = Math.max(
        0,
        Math.floor(
          Math.max(
            Math.min(MIN_WORKSPACE_HEIGHT_PX, bodyLimit),
            bodyLimit - otherContent,
          ),
        ) - WORKSPACE_HEIGHT_ROUNDING_GUARD_PX,
      )
      const height = `${available}px`
      if (
        frame.style.getPropertyValue("--verification-workspace-height") !==
        height
      )
        frame.style.setProperty("--verification-workspace-height", height)
    }
    let pending: number | undefined
    const schedule = () => {
      if (pending !== undefined) return
      pending = view.requestAnimationFrame(() => {
        pending = undefined
        measure()
      })
    }
    measure()
    const observer = new ResizeObserver(schedule)
    // Configuration/header changes can change the budget; result length cannot.
    for (const element of [frame, body, shell, ...body.children])
      observer.observe(element)
    view.addEventListener("resize", schedule)
    return () => {
      observer.disconnect()
      view.removeEventListener("resize", schedule)
      if (pending !== undefined) view.cancelAnimationFrame(pending)
    }
  }, [selectedId])

  return { frameRef, isWide }
}
