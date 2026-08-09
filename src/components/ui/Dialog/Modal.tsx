import { XIcon } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"
import {
  ReactNode,
  useCallback,
  useLayoutEffect,
  useRef,
  type MouseEvent,
  type PointerEvent,
} from "react"

import { Z_INDEX } from "~/constants/designTokens"
import { cn } from "~/lib/utils"
import { t } from "~/utils/i18n/core"

import { ToasterPortalHost } from "../../toast/ToasterPortal"
import { FloatingLayerProvider } from "../floating-layer"

type Size = "sm" | "md" | "lg" | "xl"

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children?: ReactNode
  header?: ReactNode
  footer?: ReactNode
  floatingContent?: ReactNode
  panelClassName?: string
  panelTestId?: string
  headerTestId?: string
  footerTestId?: string
  showCloseButton?: boolean
  closeOnEsc?: boolean
  closeOnBackdropClick?: boolean
  size?: Size
  /** Moves focus to a remaining dialog control when this value replaces the focused UI. */
  focusFallbackKey?: string | number | null
  /** Requests a normal Modal close when a terminal controller transition is committed. */
  terminalCloseKey?: string | number | null
  /** Shares the original opener across an explicit terminal-dialog successor. */
  focusWorkflowId?: string | number
  /** Runs after Radix finishes close-autofocus handling for this open session. */
  onCloseComplete?: () => void
}

const sizeMap: Record<Size, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
  xl: "max-w-5xl",
}

const openFloatingLayerSelector = [
  '[data-slot="select-content"][data-state="open"]',
  '[data-slot="popover-content"][data-state="open"]',
  '[data-slot="combobox-content"][data-open]',
].join(",")

type FocusSession = {
  generation: number
  restoreElement: HTMLElement | null
  active: boolean
  settled: boolean
  closeRequested: boolean
  completionNotified: boolean
  onCloseComplete?: () => void
  focusWorkflowId?: string | number
  contentElement?: HTMLElement
  parentSession?: FocusSession
}

const notifyCloseComplete = (session: FocusSession) => {
  if (!session.closeRequested || session.completionNotified) return
  session.completionNotified = true
  session.onCloseComplete?.()
}

// Radix may deliver close autofocus after a keyed Modal instance has unmounted.
// This shared stack makes only the foreground session eligible to restore focus,
// while still letting a nested child restore focus to its parent dialog.
const focusLeaseStack: FocusSession[] = []
const focusWorkflowRestorers = new Map<string | number, HTMLElement | null>()

const discardUnusedFocusWorkflowRestorer = (workflowId: string | number) => {
  if (
    !focusLeaseStack.some((session) => session.focusWorkflowId === workflowId)
  )
    focusWorkflowRestorers.delete(workflowId)
}

const discardFocusLease = (session: FocusSession) => {
  session.active = false
}

const acquireFocusLease = (session: FocusSession) => {
  for (let index = focusLeaseStack.length - 1; index >= 0; index -= 1) {
    if (!focusLeaseStack[index]?.active) focusLeaseStack.splice(index, 1)
  }
  const workflowPredecessor =
    session.focusWorkflowId === undefined
      ? null
      : [...focusLeaseStack]
          .reverse()
          .find(
            (candidate) =>
              candidate.active &&
              candidate.focusWorkflowId === session.focusWorkflowId,
          )
  if (session.focusWorkflowId !== undefined) {
    const storedRestoreElement = focusWorkflowRestorers.get(
      session.focusWorkflowId,
    )
    if (storedRestoreElement !== undefined) {
      session.restoreElement = storedRestoreElement
    } else {
      focusWorkflowRestorers.set(
        session.focusWorkflowId,
        session.restoreElement,
      )
    }
  }
  if (workflowPredecessor) {
    session.restoreElement = workflowPredecessor.restoreElement
    workflowPredecessor.active = false
  }
  session.parentSession = [...focusLeaseStack]
    .reverse()
    .find(
      (candidate) =>
        candidate.active &&
        candidate.contentElement?.contains(session.restoreElement) === true,
    )
  focusLeaseStack.push(session)
}

const settleFocusLease = (session: FocusSession) => {
  if (!focusLeaseStack.includes(session)) return null
  session.settled = true
  let restoreSession: FocusSession | null = null
  const drainedWorkflowIds = new Set<string | number>()
  while (focusLeaseStack.at(-1)?.settled) {
    const settledSession = focusLeaseStack.pop()!
    if (settledSession.active) restoreSession = settledSession
    settledSession.active = false
    if (settledSession.focusWorkflowId !== undefined)
      drainedWorkflowIds.add(settledSession.focusWorkflowId)
  }
  drainedWorkflowIds.forEach(discardUnusedFocusWorkflowRestorer)
  return restoreSession
}

const removeFocusLease = (session: FocusSession) => {
  const index = focusLeaseStack.lastIndexOf(session)
  if (index >= 0) focusLeaseStack.splice(index, 1)
  session.active = false
  if (session.focusWorkflowId !== undefined)
    discardUnusedFocusWorkflowRestorer(session.focusWorkflowId)
}

const settleDeferredFocusLease = (session: FocusSession) => {
  try {
    if (!focusLeaseStack.includes(session)) return
    if (!session.active) {
      removeFocusLease(session)
      return
    }
    if (
      focusLeaseStack.at(-1) !== session &&
      !focusLeaseStack.some(
        (candidate) => candidate.active && candidate.parentSession === session,
      )
    ) {
      removeFocusLease(session)
      return
    }
    session.settled = true
    if (focusLeaseStack.at(-1) !== session) return
    const restoreSession = settleFocusLease(session)
    const restoreFocusElement = restoreSession?.restoreElement
    if (restoreFocusElement?.isConnected) restoreFocusElement.focus()
  } finally {
    notifyCloseComplete(session)
  }
}

const scheduleDeferredFocusLeaseSettlement = (session: FocusSession) => {
  queueMicrotask(() => settleDeferredFocusLease(session))
}

/**
 * Detects nested select, popover, or combobox layers that should handle Escape
 * before the legacy Modal treats it as a dialog dismissal request.
 */
function hasOpenFloatingLayer() {
  return (
    typeof document !== "undefined" &&
    document.querySelector(openFloatingLayerSelector) !== null
  )
}

/**
 * Modal renders a Radix/shadcn-compatible dialog with the legacy slot API.
 * @deprecated Use the shadcn-style primitives from `~/components/ui/dialog`
 * for new dialogs. Keep this wrapper only for existing dialogs that still
 * depend on its legacy slots or project-specific dismissal guards.
 */
export function Modal({
  isOpen,
  onClose,
  title = "Dialog",
  children,
  header,
  footer,
  floatingContent,
  panelClassName,
  panelTestId,
  headerTestId,
  footerTestId,
  showCloseButton = true,
  closeOnEsc = true,
  closeOnBackdropClick = true,
  size = "md",
  focusFallbackKey,
  terminalCloseKey,
  focusWorkflowId,
  onCloseComplete,
}: ModalProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const backdropPointerDownTargetRef = useRef<HTMLDivElement | null>(null)
  const focusGenerationRef = useRef(0)
  const activeFocusSessionRef = useRef<FocusSession | null>(null)
  const focusSessionsByContentRef = useRef(
    new WeakMap<HTMLElement, FocusSession>(),
  )
  const wasOpenRef = useRef(false)
  const terminalCloseKeyRef = useRef<string | number | null>(null)

  useLayoutEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false
      return
    }
    if (
      !wasOpenRef.current &&
      typeof document !== "undefined" &&
      document.activeElement instanceof HTMLElement
    ) {
      const focusSession = {
        generation: ++focusGenerationRef.current,
        restoreElement: document.activeElement,
        active: true,
        settled: false,
        closeRequested: false,
        completionNotified: false,
        onCloseComplete,
        focusWorkflowId,
      }
      if (activeFocusSessionRef.current)
        discardFocusLease(activeFocusSessionRef.current)
      activeFocusSessionRef.current = focusSession
      acquireFocusLease(focusSession)
      if (contentRef.current) {
        focusSessionsByContentRef.current.set(contentRef.current, focusSession)
      }
    }
    wasOpenRef.current = true
  }, [focusWorkflowId, isOpen, onCloseComplete])

  useLayoutEffect(() => {
    const activeSession = activeFocusSessionRef.current
    if (!isOpen && activeSession) activeSession.closeRequested = true
  }, [isOpen])

  useLayoutEffect(
    () => () => {
      const activeSession = activeFocusSessionRef.current
      if (activeSession?.closeRequested) {
        // A parent can remove a controlled Modal before Radix delivers its
        // deferred close-autofocus callback. Settle only if no successor has
        // acquired the foreground lease in the same commit.
        scheduleDeferredFocusLeaseSettlement(activeSession)
      } else if (activeSession) {
        removeFocusLease(activeSession)
      }
      activeFocusSessionRef.current = null
      wasOpenRef.current = false
    },
    [],
  )

  const handleBackdropPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    backdropPointerDownTargetRef.current =
      event.target === event.currentTarget ? event.currentTarget : null
  }

  const requestClose = useCallback(() => {
    const activeSession = activeFocusSessionRef.current
    if (activeSession) activeSession.closeRequested = true
    onClose()
  }, [onClose])

  useLayoutEffect(() => {
    if (
      !isOpen ||
      terminalCloseKey === null ||
      terminalCloseKey === undefined
    ) {
      terminalCloseKeyRef.current = null
      return
    }
    if (terminalCloseKeyRef.current === terminalCloseKey) return
    terminalCloseKeyRef.current = terminalCloseKey
    requestClose()
  }, [isOpen, requestClose, terminalCloseKey])

  useLayoutEffect(() => {
    if (focusFallbackKey === null || focusFallbackKey === undefined) return
    const content = contentRef.current
    if (!isOpen || !content || content.contains(document.activeElement)) return
    const fallback = content.querySelector<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )
    fallback?.focus()
  }, [focusFallbackKey, isOpen])

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    const pointerDownTarget = backdropPointerDownTargetRef.current
    // Keep programmatic and assistive click dismissal compatible even though
    // those clicks do not have a preceding pointer event.
    const isNonPointerClick = pointerDownTarget === null && event.detail === 0
    const shouldClose =
      closeOnBackdropClick &&
      event.target === event.currentTarget &&
      (pointerDownTarget === event.currentTarget || isNonPointerClick)

    backdropPointerDownTargetRef.current = null
    if (shouldClose) requestClose()
  }

  const handleBackdropPointerCancel = () => {
    backdropPointerDownTargetRef.current = null
  }

  const shouldCloseOnEscape = () => {
    if (!closeOnEsc) return false
    if (hasOpenFloatingLayer()) return false
    const activeElement = document.activeElement
    return (
      activeElement instanceof Node &&
      contentRef.current?.contains(activeElement) === true
    )
  }

  const handleEscapeKeyDown = (event: KeyboardEvent) => {
    event.preventDefault()
    if (shouldCloseOnEscape()) requestClose()
  }

  const panelBaseClass = cn(
    `flex flex-col max-h-[90vh] relative w-full ${sizeMap[size]} bg-white dark:bg-dark-bg-secondary rounded-lg shadow-xl transform transition-all`,
    panelClassName,
  )

  return (
    <DialogPrimitive.Root open={isOpen} modal={false}>
      <DialogPrimitive.Portal>
        <div
          data-slot="modal-overlay"
          data-state={isOpen ? "open" : "closed"}
          className={cn(
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 bg-black/30 backdrop-blur-sm",
            Z_INDEX.modal,
          )}
          onPointerDown={handleBackdropPointerDown}
          onPointerCancel={handleBackdropPointerCancel}
          onClick={handleBackdropClick}
        />

        <ToasterPortalHost />
        {floatingContent}

        <FloatingLayerProvider layer="modal-contained">
          <DialogPrimitive.Content
            ref={contentRef}
            aria-describedby={undefined}
            className={cn(
              "fixed top-[50%] left-[50%] w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] outline-none",
              Z_INDEX.modal,
            )}
            onEscapeKeyDown={handleEscapeKeyDown}
            onOpenAutoFocus={(event) => {
              const focusSession = activeFocusSessionRef.current
              if (focusSession && event.currentTarget instanceof HTMLElement) {
                focusSession.contentElement = event.currentTarget
                focusSessionsByContentRef.current.set(
                  event.currentTarget,
                  focusSession,
                )
              }
            }}
            onCloseAutoFocus={(event) => {
              // Radix dispatches close autofocus on a timer after the scope
              // unmounts. The shared lease prevents a replaced instance from
              // restoring focus over the currently opened dialog.
              event.preventDefault()
              const focusSession =
                event.currentTarget instanceof HTMLElement
                  ? focusSessionsByContentRef.current.get(
                      event.currentTarget,
                    ) ?? activeFocusSessionRef.current
                  : null
              if (!focusSession) return
              try {
                const restoreSession = settleFocusLease(focusSession)
                if (!restoreSession) return
                const restoreFocusElement = restoreSession.restoreElement
                if (!restoreFocusElement?.isConnected) return
                restoreFocusElement.focus()
              } finally {
                notifyCloseComplete(focusSession)
              }
            }}
            onPointerDownOutside={(event) => {
              event.preventDefault()
            }}
            onInteractOutside={(event) => {
              event.preventDefault()
            }}
          >
            <DialogPrimitive.Title asChild>
              <span className="sr-only" aria-label={title} />
            </DialogPrimitive.Title>
            <div
              className="flex items-center justify-center p-4"
              data-slot="modal-positioner"
              onPointerDown={handleBackdropPointerDown}
              onPointerCancel={handleBackdropPointerCancel}
              onClick={handleBackdropClick}
            >
              <div
                className={panelBaseClass}
                data-testid={panelTestId}
                role="presentation"
              >
                {showCloseButton && (
                  <button
                    type="button"
                    onClick={requestClose}
                    aria-label={t("common:actions.close")}
                    className="dark:hover:bg-dark-bg-tertiary dark:hover:text-dark-text-secondary absolute top-3 right-3 z-10 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 sm:top-4 sm:right-4"
                  >
                    <XIcon className="h-5 w-5" />
                  </button>
                )}

                {header && (
                  <div
                    data-testid={headerTestId}
                    className="dark:border-dark-bg-tertiary shrink-0 border-b border-gray-100 px-4 py-3 sm:px-6 sm:py-4"
                  >
                    <div className="flex items-start justify-between">
                      {header}
                    </div>
                  </div>
                )}

                <div className="flex min-h-0 flex-1 flex-col space-y-3 overflow-y-auto p-4 sm:space-y-4 sm:p-6">
                  {children}
                </div>

                {footer && (
                  <div
                    data-testid={footerTestId}
                    className="dark:border-dark-bg-tertiary shrink-0 border-t border-gray-100 px-4 py-3 sm:px-6 sm:py-4"
                  >
                    {footer}
                  </div>
                )}
              </div>
            </div>
          </DialogPrimitive.Content>
        </FloatingLayerProvider>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
