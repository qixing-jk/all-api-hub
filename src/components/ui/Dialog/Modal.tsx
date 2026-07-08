import { XIcon } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"
import {
  ReactNode,
  useEffect,
  useId,
  useSyncExternalStore,
  type MouseEvent,
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
  showCloseButton?: boolean
  closeOnEsc?: boolean
  closeOnBackdropClick?: boolean
  size?: Size
}

const sizeMap: Record<Size, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
  xl: "max-w-5xl",
}

let activeModalStack: string[] = []
const modalStackListeners = new Set<() => void>()

const emitModalStackChange = () => {
  modalStackListeners.forEach((listener) => listener())
}

const getModalStackSnapshot = () => activeModalStack.join("|")

const subscribeModalStack = (listener: () => void) => {
  modalStackListeners.add(listener)
  return () => modalStackListeners.delete(listener)
}

const registerModal = (id: string) => {
  if (activeModalStack.includes(id)) return
  activeModalStack = [...activeModalStack, id]
  emitModalStackChange()
}

const unregisterModal = (id: string) => {
  if (!activeModalStack.includes(id)) return
  activeModalStack = activeModalStack.filter((activeId) => activeId !== id)
  emitModalStackChange()
}

const isModalTopmost = (id: string) =>
  activeModalStack[activeModalStack.length - 1] === id

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
  showCloseButton = true,
  closeOnEsc = true,
  closeOnBackdropClick = true,
  size = "md",
}: ModalProps) {
  const modalId = useId()
  const modalStackSnapshot = useSyncExternalStore(
    subscribeModalStack,
    getModalStackSnapshot,
    getModalStackSnapshot,
  )
  const topmostModalId = modalStackSnapshot.split("|").filter(Boolean).at(-1)
  const isTopmostModal = isOpen && topmostModalId === modalId

  useEffect(() => {
    if (!isOpen) {
      unregisterModal(modalId)
      return
    }

    registerModal(modalId)
    return () => unregisterModal(modalId)
  }, [isOpen, modalId])

  const handleOpenChange = (open: boolean) => {
    if (!open && isModalTopmost(modalId)) onClose()
  }

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (
      event.target !== event.currentTarget ||
      !closeOnBackdropClick ||
      !isModalTopmost(modalId)
    ) {
      return
    }
    onClose()
  }

  const panelBaseClass = cn(
    `flex flex-col max-h-[90vh] relative w-full ${sizeMap[size]} bg-white dark:bg-dark-bg-secondary rounded-lg shadow-xl transform transition-all`,
    panelClassName,
  )

  return (
    <DialogPrimitive.Root
      open={isOpen}
      onOpenChange={handleOpenChange}
      modal={isTopmostModal}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          data-slot="modal-overlay"
          className={cn(
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 bg-black/30 backdrop-blur-sm",
            Z_INDEX.modal,
          )}
          onPointerDown={(event) => {
            if (!closeOnBackdropClick) event.preventDefault()
          }}
        />

        <ToasterPortalHost />
        {floatingContent}

        <FloatingLayerProvider layer="modal-contained">
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className={cn(
              "fixed top-[50%] left-[50%] w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] outline-none",
              Z_INDEX.modal,
            )}
            onEscapeKeyDown={(event) => {
              if (!closeOnEsc || !isModalTopmost(modalId)) {
                event.preventDefault()
              }
            }}
            onPointerDownOutside={(event) => {
              if (!closeOnBackdropClick || !isModalTopmost(modalId)) {
                event.preventDefault()
              }
            }}
            onInteractOutside={(event) => {
              if (!closeOnBackdropClick || !isModalTopmost(modalId)) {
                event.preventDefault()
              }
            }}
          >
            <DialogPrimitive.Title asChild>
              <span className="sr-only" aria-label={title} />
            </DialogPrimitive.Title>
            <div
              className="flex items-center justify-center p-4"
              data-slot="modal-positioner"
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
                    onClick={onClose}
                    aria-label={t("common:actions.close")}
                    className="dark:hover:bg-dark-bg-tertiary dark:hover:text-dark-text-secondary absolute top-3 right-3 z-10 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 sm:top-4 sm:right-4"
                  >
                    <XIcon className="h-5 w-5" />
                  </button>
                )}

                {header && (
                  <div className="dark:border-dark-bg-tertiary shrink-0 border-b border-gray-100 px-4 py-3 sm:px-6 sm:py-4">
                    <div className="flex items-start justify-between">
                      {header}
                    </div>
                  </div>
                )}

                <div className="flex min-h-0 flex-1 flex-col space-y-3 overflow-y-auto p-4 sm:space-y-4 sm:p-6">
                  {children}
                </div>

                {footer && (
                  <div className="dark:border-dark-bg-tertiary shrink-0 border-t border-gray-100 px-4 py-3 sm:px-6 sm:py-4">
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
