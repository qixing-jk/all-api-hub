import { X } from "lucide-react"
import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { HelpHintIcon } from "~/components/icons/productIcons"
import { Button } from "~/components/ui"
import { hasOpenFloatingLayer } from "~/components/ui/floating-layer"
import { Popover, PopoverAnchor, PopoverContent } from "~/components/ui/popover"
import { cn } from "~/lib/utils"

/** Read-only balance details: hover previews, click pins, and keyboard focus opens. */
export function AllowanceDetailsPopover({
  label,
  children,
  trigger,
  triggerClassName,
}: {
  label: string
  children: ReactNode
  trigger?: ReactNode
  triggerClassName?: string
}) {
  const { t } = useTranslation("common")
  const contentId = useId()
  const descriptionId = `${contentId}-description`
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const pinnedRef = useRef(false)
  const pointerInsideRef = useRef(false)
  const restoreFocusRef = useRef(false)
  const restoringFocusRef = useRef(false)
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
        if (!next)
          restoreFocusRef.current =
            contentRef.current?.contains(document.activeElement) ?? false
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
          className={cn(
            trigger
              ? "size-5 shrink-0 px-0 text-xs text-muted-foreground"
              : "size-5 shrink-0 text-muted-foreground",
            triggerClassName,
          )}
          aria-label={label}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? contentId : undefined}
          aria-describedby={open ? descriptionId : undefined}
          onPointerEnter={(event) => {
            if (event.pointerType !== "touch") showPreview()
          }}
          onPointerLeave={(event) => {
            if (event.pointerType !== "touch") releasePointer()
          }}
          onFocus={() => {
            if (restoringFocusRef.current) return
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
          {trigger ?? <HelpHintIcon className="size-3.5" aria-hidden="true" />}
        </Button>
      </PopoverAnchor>
      <PopoverContent
        ref={contentRef}
        id={contentId}
        align="end"
        aria-label={label}
        className="max-h-[min(32rem,var(--radix-popover-content-available-height))] w-96 max-w-[calc(100vw-1rem)] overflow-y-auto px-4 py-3 text-left text-xs shadow-none"
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
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          if (restoreFocusRef.current) {
            restoreFocusRef.current = false
            restoringFocusRef.current = true
            triggerRef.current?.focus()
            restoringFocusRef.current = false
          }
        }}
        onEscapeKeyDown={(event) => {
          // A focused observation hint handles Escape before its enclosing details.
          if (hasOpenFloatingLayer(contentRef.current)) {
            event.preventDefault()
          }
        }}
      >
        <Button
          variant="ghost"
          size="icon"
          className="float-right -mt-0.5 -mr-1 ml-2 size-6 text-muted-foreground"
          aria-label={t("actions.close")}
          onClick={() => {
            clearCloseTimer()
            pinnedRef.current = false
            pointerInsideRef.current = false
            restoreFocusRef.current = true
            setOpen(false)
          }}
        >
          <X className="size-3.5" aria-hidden="true" />
        </Button>
        <div id={descriptionId}>{children}</div>
      </PopoverContent>
    </Popover>
  )
}
