import { Dialog, Transition } from "@headlessui/react"
import { XMarkIcon } from "@heroicons/react/24/outline"
import { Fragment, ReactNode } from "react"

type Size = "sm" | "md" | "lg"

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  children?: ReactNode
  header?: ReactNode
  footer?: ReactNode
  panelClassName?: string
  showCloseButton?: boolean
  closeOnEsc?: boolean
  closeOnBackdropClick?: boolean
  size?: Size
}

const sizeMap: Record<Size, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
}

/**
 * Modal renders a HeadlessUI dialog with configurable size, close behavior, and slots for header/footer.
 */
export function Modal({
  isOpen,
  onClose,
  children,
  header,
  footer,
  panelClassName,
  showCloseButton = true,
  closeOnEsc = true,
  closeOnBackdropClick = true,
  size = "md",
}: ModalProps) {
  // Intercept onKeyDown to optionally prevent Escape from closing
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && !closeOnEsc) {
      e.stopPropagation()
      e.preventDefault()
    }
  }

  const overlayClickHandler = (e: React.MouseEvent) => {
    if (!closeOnBackdropClick) {
      // prevent Dialog from calling onClose via overlay click
      e.stopPropagation()
    } else {
      onClose()
    }
  }

  const panelBaseClass =
    `relative w-full ${sizeMap[size]} bg-white dark:bg-dark-bg-secondary rounded-lg shadow-xl transform transition-all` +
    (panelClassName ? ` ${panelClassName}` : "")

  return (
    <Transition show={isOpen} as={Fragment}>
      <Dialog
        onClose={onClose}
        className="relative z-50"
        onKeyDown={handleKeyDown}
      >
        {/* backdrop */}
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div
            className="fixed inset-0 bg-black/30 backdrop-blur-sm"
            aria-hidden="true"
            onClick={overlayClickHandler}
          />
        </Transition.Child>

        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0 scale-95 translate-y-4"
            enterTo="opacity-100 scale-100 translate-y-0"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 scale-100 translate-y-0"
            leaveTo="opacity-0 scale-95 translate-y-4"
          >
            <Dialog.Panel className={panelBaseClass}>
              {/* close button */}
              {showCloseButton && (
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="dark:hover:bg-dark-bg-tertiary dark:hover:text-dark-text-secondary absolute top-4 right-4 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              )}

              {/* header area: modal controls header padding and divider */}
              {header && (
                <div className="dark:border-dark-bg-tertiary border-b border-gray-100 px-6 py-4">
                  <div className="flex items-start justify-between">
                    {header}
                  </div>
                </div>
              )}

              {/* content area */}
              <div className={`max-h-[65vh] space-y-2 overflow-y-auto p-4`}>
                {children}
              </div>

              {/* footer area with top divider when present */}
              {footer && (
                <div className="dark:border-dark-bg-tertiary border-t border-gray-100 px-6 py-4">
                  {footer}
                </div>
              )}
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition>
  )
}

export default Modal
