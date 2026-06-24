import { useCallback, useEffect, useRef, useState } from "react"

const KEYBOARD_EVENTS_TO_CONTAIN = ["keydown", "keyup"] as const

/**
 * Owns DOM-only shell behavior for the content-script API check modal.
 */
export function useApiCheckModalShell(isOpen: boolean) {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const backdropRef = useRef<HTMLDivElement | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)

  /**
   * Radix popovers (used by `SearchableSelect`) portal to `document.body` by default.
   * In our content-script ShadowRoot UI that causes the dropdown to escape styling
   * and appear behind the overlay. We provide a local portal container inside the
   * modal root instead.
   */
  const [popoverPortalContainer, setPopoverPortalContainer] =
    useState<HTMLElement | null>(null)
  const popoverPortalContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      setPopoverPortalContainer(node)
    },
    [],
  )

  useEffect(() => {
    if (!isOpen) return
    dialogRef.current?.focus({ preventScroll: true })
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    const stopKeyboardShortcut = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof Node && dialogRef.current?.contains(target)) {
        event.stopImmediatePropagation()
      }
    }
    const stopWheel = (event: WheelEvent) => {
      event.stopPropagation()
    }
    const stopBackgroundWheel = (event: WheelEvent) => {
      event.preventDefault()
      event.stopPropagation()
    }
    const documentElement = document.documentElement
    const body = document.body
    const previousDocumentOverflow = documentElement.style.overflow
    const previousBodyOverflow = body.style.overflow

    const dialog = dialogRef.current
    const backdrop = backdropRef.current
    const scrollContainer = scrollContainerRef.current

    KEYBOARD_EVENTS_TO_CONTAIN.forEach((eventName) => {
      document.addEventListener(eventName, stopKeyboardShortcut, {
        capture: true,
      })
    })
    documentElement.style.overflow = "hidden"
    body.style.overflow = "hidden"
    dialog?.addEventListener("wheel", stopBackgroundWheel, { passive: false })
    backdrop?.addEventListener("wheel", stopBackgroundWheel, {
      passive: false,
    })
    scrollContainer?.addEventListener("wheel", stopWheel, { passive: false })

    return () => {
      KEYBOARD_EVENTS_TO_CONTAIN.forEach((eventName) => {
        document.removeEventListener(eventName, stopKeyboardShortcut, {
          capture: true,
        })
      })
      documentElement.style.overflow = previousDocumentOverflow
      body.style.overflow = previousBodyOverflow
      dialog?.removeEventListener("wheel", stopBackgroundWheel)
      backdrop?.removeEventListener("wheel", stopBackgroundWheel)
      scrollContainer?.removeEventListener("wheel", stopWheel)
    }
  }, [isOpen])

  return {
    popoverPortalContainer,
    refs: {
      popoverPortalContainerRef,
      backdropRef,
      dialogRef,
      scrollContainerRef,
    },
  }
}
