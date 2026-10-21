import { useEffect, useRef } from "react"

import { formatLocalDayKey } from "~/utils/core/dayKey"

/** Recomputes date-sensitive views at midnight and after browser suspension. */
export function useLocalDayChange(onChange: () => void) {
  const callback = useRef(onChange)
  callback.current = onChange
  useEffect(() => {
    let day = formatLocalDayKey()
    let timer: ReturnType<typeof setTimeout>
    const checkDay = () => {
      clearTimeout(timer)
      const now = new Date()
      const nextDay = formatLocalDayKey(now)
      if (nextDay !== day) {
        day = nextDay
        callback.current()
      }
      const midnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
      )
      timer = setTimeout(
        checkDay,
        Math.max(1, midnight.getTime() - now.getTime()),
      )
    }
    checkDay()
    window.addEventListener("focus", checkDay)
    document.addEventListener("visibilitychange", checkDay)
    return () => {
      clearTimeout(timer)
      window.removeEventListener("focus", checkDay)
      document.removeEventListener("visibilitychange", checkDay)
    }
  }, [])
}
