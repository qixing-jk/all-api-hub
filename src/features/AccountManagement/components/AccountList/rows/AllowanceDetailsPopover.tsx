import { Info } from "lucide-react"
import { useEffect, useId, useRef, useState, type ReactNode } from "react"

import { Button } from "~/components/ui"
import { Popover, PopoverAnchor, PopoverContent } from "~/components/ui/popover"

/** Read-only balance details: hover previews, click pins, and keyboard focus opens. */
export function AllowanceDetailsPopover({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  const contentId = useId()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const pinnedRef = useRef(false)
  const pointerInsideRef = useRef(false)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearCloseTimer = () => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }
  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) clearTimeout(closeTimerRef.current)
    },
    [],
  )
  const showPreview = () => {
    clearCloseTimer()
    pointerInsideRef.current = true
    setOpen(true)
  }
  const scheduleClose = () => {
    clearCloseTimer()
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null
      const focused = document.activeElement
      if (
        !pointerInsideRef.current &&
        !pinnedRef.current &&
        !triggerRef.current?.contains(focused) &&
        !contentRef.current?.contains(focused)
      )
        setOpen(false)
    }, 120)
  }
  const releasePointer = () => {
    pointerInsideRef.current = false
    scheduleClose()
  }
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          clearCloseTimer()
          pinnedRef.current = false
        }
      }}
    >
      <PopoverAnchor asChild>
        <Button
          ref={triggerRef}
          variant="ghost"
          size="icon"
          className="text-muted-foreground size-5 shrink-0"
          aria-label={label}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? contentId : undefined}
          onPointerEnter={(event) => {
            if (event.pointerType !== "touch") showPreview()
          }}
          onPointerLeave={(event) => {
            if (event.pointerType !== "touch") releasePointer()
          }}
          onFocus={() => {
            clearCloseTimer()
            setOpen(true)
          }}
          onBlur={scheduleClose}
          onClick={() => {
            clearCloseTimer()
            pinnedRef.current = !pinnedRef.current
            setOpen(pinnedRef.current)
          }}
        >
          <Info className="size-3.5" aria-hidden="true" />
        </Button>
      </PopoverAnchor>
      <PopoverContent
        ref={contentRef}
        id={contentId}
        align="end"
        aria-label={label}
        className="max-h-[min(28rem,var(--radix-popover-content-available-height))] w-80 max-w-[calc(100vw-1rem)] overflow-y-auto text-left text-xs"
        onPointerEnter={(event) => {
          if (event.pointerType !== "touch") showPreview()
        }}
        onPointerLeave={(event) => {
          if (event.pointerType !== "touch") releasePointer()
        }}
        onFocusCapture={clearCloseTimer}
        onBlurCapture={scheduleClose}
        onInteractOutside={(event) => {
          // The anchor owns click-to-pin; Radix must not dismiss it before that click.
          if (
            event.target instanceof Node &&
            triggerRef.current?.contains(event.target)
          )
            event.preventDefault()
        }}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        {children}
      </PopoverContent>
    </Popover>
  )
}
