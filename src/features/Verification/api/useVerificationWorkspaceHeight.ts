import { useLayoutEffect, useRef, useState } from "react"

const MIN_WORKSPACE_HEIGHT_PX = 160
const WORKSPACE_HEIGHT_ROUNDING_GUARD_PX = 1

/** Reserve the remaining dialog height independently of the selected content. */
export function useVerificationWorkspaceHeight(selectedId: string | null) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [isWide, setIsWide] = useState(false)
  const [isThreeColumn, setIsThreeColumn] = useState(false)
  const [availableHeight, setAvailableHeight] = useState(0)

  useLayoutEffect(() => {
    const frame = frameRef.current
    const view = frame?.ownerDocument.defaultView
    const body = frame?.closest<HTMLElement>(
      '[data-slot="modal-body"], [data-verification-scroll]',
    )
    const shell = body?.closest<HTMLElement>(
      '[data-slot="modal-panel"], [role="dialog"]',
    )
    if (!frame || !view || !body || !shell) return
    const measure = () => {
      // Both mobile and desktop details occupy the frame with absolute layout.
      // Read the same CSS boundary that chooses the split view.
      const wide =
        view
          .getComputedStyle(frame)
          .getPropertyValue("--verification-layout")
          .trim() === "split"
      setIsWide(wide)
      setIsThreeColumn(frame.clientWidth >= 1152)
      const limit = Number.parseFloat(view.getComputedStyle(shell).maxHeight)
      if (!Number.isFinite(limit)) {
        setAvailableHeight(0)
        return
      }
      const chrome = shell.offsetHeight - body.clientHeight
      // The workspace is the final block in the dialog body. Measure the flow
      // before it rather than scrollHeight, which includes overflowing results
      // and can feed back into a progressively smaller height budget.
      const otherContent =
        frame.getBoundingClientRect().top -
        body.getBoundingClientRect().top +
        body.scrollTop +
        Number.parseFloat(view.getComputedStyle(body).paddingBottom || "0")
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
      setAvailableHeight(available)
      // The introduction's size container uses the room after selectors/composer.
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

  return { frameRef, isWide, isThreeColumn, availableHeight }
}
