import { CircleHelp, TriangleAlert, type LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { Button } from "~/components/ui/button"
import { Modal } from "~/components/ui/Dialog/Modal"

interface ConfirmDialogProps {
  /**
   * Keeps the header and confirm button consistent; defaults to a general confirmation.
   */
  intent?: "confirm" | "warning" | "destructive"
  /**
   * Controls whether the modal is visible.
   */
  isOpen: boolean
  /**
   * Called when the modal should close (close button, backdrop click, Escape).
   */
  onClose: () => void
  /**
   * Primary title shown in the header next to the action icon.
   */
  title: string
  /**
   * Supporting text shown in the body.
   */
  description: string
  /**
   * Optional heading shown above the description inside the warning section.
   * When omitted, the section renders only the description to avoid duplicating the header title.
   */
  warningTitle?: string
  /**
   * Label for the confirm button.
   */
  confirmLabel: string
  /**
   * Optional label shown while the action is in progress.
   */
  workingLabel?: string
  /**
   * Label for the cancel button.
   */
  cancelLabel: string
  /**
   * Called when the user confirms the action.
   */
  onConfirm: () => void
  /**
   * Optional extra content rendered below the warning copy (e.g., entity details).
   */
  details?: ReactNode
  /**
   * Disables interactions and prevents closing while an action is in progress.
   */
  isWorking?: boolean
  /**
   * Optional modal size; defaults to a compact dialog.
   */
  size?: "sm" | "md" | "lg"
  /**
   * Optional stable selector for the confirmation action.
   */
  confirmButtonTestId?: string
  /**
   * Optional stable selector for the cancel action.
   */
  cancelButtonTestId?: string
  /**
   * Optional action-specific header icon; its color follows the action intent.
   */
  icon?: LucideIcon
}

const intentPresentation = {
  confirm: {
    icon: CircleHelp,
    iconClassName: "text-primary",
    confirmVariant: "default",
  },
  warning: {
    icon: TriangleAlert,
    iconClassName: "text-amber-600 dark:text-amber-400",
    confirmVariant: "warning",
  },
  destructive: {
    icon: TriangleAlert,
    iconClassName: "text-red-600 dark:text-red-400",
    confirmVariant: "destructive",
  },
} as const

/**
 * Shared confirmation layout with a general default, action-specific intent,
 * and consistent header and button presentation.
 */
export function ConfirmDialog({
  intent = "confirm",
  isOpen,
  onClose,
  title,
  description,
  warningTitle,
  confirmLabel,
  workingLabel,
  cancelLabel,
  onConfirm,
  details,
  isWorking = false,
  size = "sm",
  confirmButtonTestId,
  cancelButtonTestId,
  icon,
}: ConfirmDialogProps) {
  const presentation = intentPresentation[intent]
  const Icon = icon ?? presentation.icon

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      closeOnBackdropClick={!isWorking}
      closeOnEsc={!isWorking}
      showCloseButton={!isWorking}
      size={size}
      header={
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Icon
              className={`h-5 w-5 ${presentation.iconClassName}`}
              aria-hidden="true"
            />
            <h2 className="dark:text-dark-text-primary text-lg font-semibold text-gray-900">
              {title}
            </h2>
          </div>
        </div>
      }
      footer={
        <div className="flex space-x-3">
          <Button
            type="button"
            onClick={onClose}
            variant="secondary"
            className="flex-1"
            disabled={isWorking}
            data-testid={cancelButtonTestId}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            variant={presentation.confirmVariant}
            className="flex-1"
            loading={isWorking}
            data-testid={confirmButtonTestId}
            data-variant={presentation.confirmVariant}
          >
            {isWorking ? workingLabel ?? confirmLabel : confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex space-x-3">
          <div className="flex-1">
            {warningTitle && (
              <h3 className="dark:text-dark-text-primary mb-2 text-sm font-medium text-gray-900">
                {warningTitle}
              </h3>
            )}
            <p className="dark:text-dark-text-secondary text-sm text-gray-500">
              {description}
            </p>
          </div>
        </div>
        {details}
      </div>
    </Modal>
  )
}
