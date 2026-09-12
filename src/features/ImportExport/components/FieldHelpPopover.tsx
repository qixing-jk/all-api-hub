import { CircleHelp } from "lucide-react"
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"

import { Popover, PopoverAnchor, PopoverContent } from "~/components/ui/popover"

/**
 * A compact field-level help affordance that supports hover, focus, click,
 * outside-click, and Escape dismissal without adding permanent page noise.
 */
export function FieldHelpPopover({
  label,
  content,
}: {
  label: string
  content: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const pinnedRef = useRef(false)
  const pointerInsideRef = useRef(false)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  const scheduleClose = useCallback(() => {
    clearCloseTimer()
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null
      if (!pointerInsideRef.current && !pinnedRef.current) {
        setOpen(false)
      }
    }, 120)
  }, [clearCloseTimer])

  const keepOpen = useCallback(() => {
    pointerInsideRef.current = true
    clearCloseTimer()
    setOpen(true)
  }, [clearCloseTimer])

  const releasePointer = useCallback(() => {
    pointerInsideRef.current = false
    if (!pinnedRef.current) scheduleClose()
  }, [scheduleClose])

  useEffect(() => clearCloseTimer, [clearCloseTimer])

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) pinnedRef.current = false
      }}
    >
      <PopoverAnchor asChild>
        <button
          type="button"
          aria-label={label}
          aria-expanded={open}
          aria-haspopup="dialog"
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex size-5 shrink-0 items-center justify-center rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
          onPointerEnter={keepOpen}
          onPointerLeave={releasePointer}
          onFocus={() => {
            clearCloseTimer()
            setOpen(true)
          }}
          onBlur={(event) => {
            if (!(event.relatedTarget instanceof Node)) scheduleClose()
            else if (!event.currentTarget.contains(event.relatedTarget)) {
              scheduleClose()
            }
          }}
          onClick={() => {
            pinnedRef.current = !pinnedRef.current
            setOpen(pinnedRef.current)
          }}
        >
          <CircleHelp className="size-4" aria-hidden="true" />
        </button>
      </PopoverAnchor>
      <PopoverContent
        side="top"
        align="start"
        className="w-80 max-w-[calc(100vw-2rem)] text-sm leading-5"
        onPointerEnter={keepOpen}
        onPointerLeave={releasePointer}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        {content}
      </PopoverContent>
    </Popover>
  )
}
