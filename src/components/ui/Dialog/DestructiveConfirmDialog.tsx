import { DialogTitle } from "@headlessui/react"
import { TrashIcon } from "@heroicons/react/24/outline"
import type { ReactNode } from "react"

import { Button } from "~/components/ui/button"
import { Modal } from "~/components/ui/Dialog/Modal"

interface DeleteConfirmModalProps {
  /**
   * Controls whether the modal is visible.
   */
  isOpen: boolean
  /**
   * Called when the modal should close (close button, backdrop click, Escape).
   */
  onClose: () => void
  /**
   * Primary title shown in the header next to the trash icon.
   */
  title: string
  /**
   * Supporting text shown in the body warning section.
   */
  description: string
  /**
   * Optional heading shown above the description inside the warning section.
   * When omitted, the section renders only the description to avoid duplicating the header title.
   */
  warningTitle?: string
  /**
   * Label for the confirm (destructive) button.
   */
  confirmLabel: string
  /**
   * Label for the cancel button.
   */
  cancelLabel: string
  /**
   * Called when the user confirms the destructive action.
   */
  onConfirm: () => void
  /**
   * Optional extra content rendered below the warning copy (e.g., entity details).
   */
  details?: ReactNode
  /**
   * Disables interactions and prevents closing while a destructive action is in progress.
   */
  isWorking?: boolean
  /**
   * Optional modal size; defaults to a compact dialog.
   */
  size?: "sm" | "md" | "lg"
}

/**
 * DestructiveConfirmDialog is a standardized destructive confirmation dialog.
 *
 * It matches the app's existing delete dialogs by using the shared `Modal` layout,
 * a warning section, and a destructive confirm button.
 */
export function DestructiveConfirmDialog({
  isOpen,
  onClose,
  title,
  description,
  warningTitle,
  confirmLabel,
  cancelLabel,
  onConfirm,
  details,
  isWorking = false,
  size = "sm",
}: DeleteConfirmModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      closeOnBackdropClick={!isWorking}
      closeOnEsc={!isWorking}
      showCloseButton={!isWorking}
      size={size}
      header={
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <TrashIcon className="h-5 w-5 text-red-600 dark:text-red-400" />
            <DialogTitle className="dark:text-dark-text-primary text-lg font-semibold text-gray-900">
              {title}
            </DialogTitle>
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
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            variant="destructive"
            className="flex-1"
            loading={isWorking}
            disabled={isWorking}
          >
            {confirmLabel}
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
