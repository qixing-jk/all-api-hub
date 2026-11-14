import {
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react"
import { createPortal } from "react-dom"

import { hasOpenFloatingLayer } from "~/components/ui/floating-layer"
import { Sheet, SheetContent, SheetTitle } from "~/components/ui/sheet"

import { moveVerificationPortalHost } from "./moveVerificationPortalHost"
import {
  VERIFICATION_SIDEBAR_SIDES,
  type VerificationSidebarSide,
} from "./types"
import { VerificationSelectionContext } from "./VerificationSelectionContext"

/** Keep the editors' React portal stable while Radix mounts and removes its modal shell. */
export function VerificationSidebarPanel({
  children,
  side,
  title,
  id,
  open,
  isWide,
  preparing,
  onClose,
  toggleRef,
  panelRef,
  onKeyDown,
  restoreFocus = true,
  animate = true,
}: {
  children: ReactNode
  side: VerificationSidebarSide
  title: string
  id: string
  open: boolean
  isWide: boolean
  preparing: boolean
  onClose: () => void
  toggleRef: RefObject<HTMLButtonElement | null>
  panelRef?: RefObject<HTMLElement | null>
  onKeyDown?: React.KeyboardEventHandler<HTMLElement>
  restoreFocus?: boolean
  animate?: boolean
}) {
  const [editorContainer] = useState(() => document.createElement("div"))
  const [portalContainer, setPortalContainer] = useState<
    Element | DocumentFragment | null
  >(null)
  const parkingRef = useRef<HTMLElement | null>(null)
  const [drawerAttached, setDrawerAttached] = useState(false)
  const selection = useContext(VerificationSelectionContext)
  const drawerOpen = open && !isWide && !preparing
  const listSelection = useMemo(
    () =>
      selection && side === VERIFICATION_SIDEBAR_SIDES.Left && !isWide
        ? { ...selection, listCollapsed: !(drawerOpen || drawerAttached) }
        : selection,
    [selection, side, isWide, drawerOpen, drawerAttached],
  )
  const parkedHidden =
    drawerOpen ||
    (side === VERIFICATION_SIDEBAR_SIDES.Right ? !open : preparing)
  // Only move a portal host, never React-owned editor nodes. Both local component
  // state and uncontrolled inputs survive close, resize and preparation changes.
  const attachDrawer = useCallback(
    (node: HTMLDivElement | null) => {
      setDrawerAttached(node !== null)
      const host = node ?? parkingRef.current
      if (host) moveVerificationPortalHost(editorContainer, host)
    },
    [editorContainer],
  )
  const attachParking = useCallback(
    (node: HTMLElement | null) => {
      parkingRef.current = node
      if (panelRef) panelRef.current = node
      if (node && !editorContainer.parentElement)
        node.appendChild(editorContainer)
      if (node) {
        // Anchor both layers to the test workspace inside the enclosing dialog.
        setPortalContainer(
          node.closest<HTMLElement>(".verification-workspace-frame"),
        )
      }
    },
    [editorContainer, panelRef],
  )
  editorContainer.className =
    side === VERIFICATION_SIDEBAR_SIDES.Left
      ? "contents"
      : "verification-settings-editors flex min-h-0 flex-1 flex-col"

  return (
    <>
      <aside
        id={drawerOpen ? undefined : id}
        ref={attachParking}
        // Desktop CSS retires the outgoing panel after its exit transition.
        // Accessibility and focus are disabled immediately by the flags below.
        hidden={
          parkedHidden && (!isWide || side === VERIFICATION_SIDEBAR_SIDES.Left)
        }
        inert={parkedHidden}
        aria-hidden={parkedHidden}
        tabIndex={-1}
        aria-label={title}
        data-verification-settings={
          side === VERIFICATION_SIDEBAR_SIDES.Right && !drawerOpen
            ? ""
            : undefined
        }
        data-escape-boundary={
          side === VERIFICATION_SIDEBAR_SIDES.Right ? "" : undefined
        }
        className={
          side === VERIFICATION_SIDEBAR_SIDES.Left
            ? "contents"
            : "verification-workspace-settings absolute inset-y-0 right-0 z-20 flex w-[min(var(--verification-settings-width),100%)] flex-col border border-border bg-surface-subtle shadow-lg outline-none"
        }
        onKeyDown={onKeyDown}
      />
      {createPortal(
        <div className="contents" onKeyDown={onKeyDown}>
          <VerificationSelectionContext.Provider value={listSelection}>
            {children}
          </VerificationSelectionContext.Provider>
        </div>,
        editorContainer,
      )}
      <Sheet
        // The enclosing API dialog owns dismissal; its header/footer stay usable.
        modal={false}
        open={drawerOpen}
        onOpenChange={(next) => {
          if (!next) onClose()
        }}
      >
        <SheetContent
          id={drawerOpen ? id : undefined}
          side={side}
          showCloseButton={false}
          portalContainer={portalContainer}
          overlayClassName="absolute"
          data-verification-settings={
            side === VERIFICATION_SIDEBAR_SIDES.Right ? "" : undefined
          }
          data-escape-boundary
          data-animate={animate}
          inert={!drawerOpen}
          aria-describedby={undefined}
          className="verification-sidebar-sheet absolute w-full gap-0 border-0 shadow-none sm:max-w-none"
          onInteractOutside={(event) => {
            const originalEvent = event.detail.originalEvent
            // document listeners see the host as target for shadow-root events.
            const target =
              originalEvent.composedPath()[0] ?? originalEvent.target
            // Persistent editors have a different React ancestry. Radix's
            // React capture boundary must also respect their actual DOM host.
            if (
              (target instanceof Node && editorContainer.contains(target)) ||
              (target instanceof Element &&
                target.closest(
                  '[data-slot="popover-content"], [data-slot="select-content"], [data-verification-workspace-bar], [data-verification-run-options-trigger]',
                ))
            )
              event.preventDefault()
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            if (restoreFocus) toggleRef.current?.focus()
          }}
          onEscapeKeyDown={(event) => {
            if (hasOpenFloatingLayer(editorContainer)) event.preventDefault()
          }}
        >
          <SheetTitle className="sr-only">{title}</SheetTitle>
          <div ref={attachDrawer} className="flex min-h-0 flex-1 flex-col" />
        </SheetContent>
      </Sheet>
    </>
  )
}
