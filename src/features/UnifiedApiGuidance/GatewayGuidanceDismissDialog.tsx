import { Button } from "~/components/ui"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"

interface GatewayGuidanceDismissDialogProps {
  isOpen: boolean
  title: string
  description: string
  cancelLabel: string
  confirmLabel: string
  errorMessage?: string
  isSaving?: boolean
  onClose: () => void
  onConfirm: () => void
}

/**
 * Confirmation dialog for permanently hiding source-surface gateway guidance.
 */
export function GatewayGuidanceDismissDialog({
  isOpen,
  title,
  description,
  cancelLabel,
  confirmLabel,
  errorMessage,
  isSaving = false,
  onClose,
  onConfirm,
}: GatewayGuidanceDismissDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={!isSaving}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {errorMessage ? (
          <p
            role="alert"
            aria-label={errorMessage}
            className="text-sm text-red-600 dark:text-red-400"
          >
            {errorMessage}
          </p>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isSaving}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            loading={isSaving}
            disabled={isSaving}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
