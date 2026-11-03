import { useCallback, useEffect, useRef, useState } from "react"

/** Coalesces virtual-list measurements and cancels pending work on unmount. */
export function useModelListHeight() {
  const [listHeight, setListHeight] = useState(0)
  const heightFrame = useRef<number | undefined>(undefined)
  const measuredHeight = useRef(0)
  const handleListHeightChanged = useCallback((height: number) => {
    measuredHeight.current = height
    if (heightFrame.current !== undefined) return
    // Keep synchronous virtual-list measurements out of React's layout updates.
    heightFrame.current = requestAnimationFrame(() => {
      heightFrame.current = undefined
      setListHeight(measuredHeight.current)
    })
  }, [])
  useEffect(
    () => () => {
      if (heightFrame.current !== undefined)
        cancelAnimationFrame(heightFrame.current)
      heightFrame.current = undefined
    },
    [],
  )
  return { listHeight, handleListHeightChanged }
}
