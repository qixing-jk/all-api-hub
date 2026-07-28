import type { FormEvent, ReactNode } from "react"

import { Button, Modal } from "~/components/ui"

/** Shared modal and form shell for legacy and resource-native channel editors. */
export function ChannelEditorShell({
  isOpen,
  title,
  description,
  children,
  onClose,
  onSubmit,
  submitLabel,
  closeLabel,
  submitTestId,
  showSubmit = true,
  isSubmitDisabled = false,
  isSubmitting = false,
}: {
  isOpen: boolean
  title: string
  description?: string
  children: ReactNode
  onClose: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  submitLabel?: string
  closeLabel: string
  submitTestId?: string
  showSubmit?: boolean
  isSubmitDisabled?: boolean
  isSubmitting?: boolean
}) {
  const handleClose = () => {
    if (isSubmitting) return
    onClose()
  }
  const header = (
    <div>
      <h3 className="dark:text-dark-text-primary text-lg font-semibold text-gray-900">
        {title}
      </h3>
      {description ? (
        <p className="dark:text-dark-text-secondary mt-1 text-sm text-gray-500">
          {description}
        </p>
      ) : null}
    </div>
  )
  const footer = (
    <div className="flex justify-end gap-3">
      <Button
        variant="outline"
        onClick={handleClose}
        disabled={isSubmitting}
        type="button"
      >
        {closeLabel}
      </Button>
      {showSubmit ? (
        <Button
          type="submit"
          form="channel-editor-form"
          disabled={isSubmitDisabled || isSubmitting}
          loading={isSubmitting}
          data-testid={submitTestId}
        >
          {submitLabel}
        </Button>
      ) : null}
    </div>
  )
  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      closeOnBackdropClick={!isSubmitting}
      closeOnEsc={!isSubmitting}
      showCloseButton={!isSubmitting}
      size="lg"
      header={header}
      footer={footer}
    >
      <form id="channel-editor-form" onSubmit={onSubmit} className="space-y-4">
        {children}
      </form>
    </Modal>
  )
}

export default ChannelEditorShell
