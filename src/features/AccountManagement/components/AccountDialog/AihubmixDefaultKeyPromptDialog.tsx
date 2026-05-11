import { DialogTitle } from "@headlessui/react"
import { KeyIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { Alert } from "~/components/ui/Alert"
import { Button } from "~/components/ui/button"
import { Modal } from "~/components/ui/Dialog/Modal"

export interface AihubmixDefaultKeyPromptDialogProps {
  isOpen: boolean
  accountName: string
  isCreating: boolean
  onCancel: () => void
  onConfirm: () => void
}

/**
 * Prompts before creating an AIHubMix key because the full secret is returned
 * only at creation time and cannot be recovered later.
 */
export function AihubmixDefaultKeyPromptDialog({
  isOpen,
  accountName,
  isCreating,
  onCancel,
  onConfirm,
}: AihubmixDefaultKeyPromptDialogProps) {
  const { t } = useTranslation(["accountDialog"])

  return (
    <Modal
      isOpen={isOpen}
      onClose={isCreating ? () => {} : onCancel}
      closeOnBackdropClick={false}
      size="sm"
      header={
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <KeyIcon className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
            <DialogTitle className="dark:text-dark-text-primary text-lg font-semibold text-gray-900">
              {t("accountDialog:aihubmixDefaultKeyPrompt.title")}
            </DialogTitle>
          </div>
        </div>
      }
      footer={
        <div className="flex space-x-3">
          <Button
            type="button"
            onClick={onCancel}
            variant="secondary"
            className="flex-1"
            disabled={isCreating}
          >
            {t("accountDialog:aihubmixDefaultKeyPrompt.cancel")}
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            variant="warning"
            className="flex-1"
            disabled={isCreating}
          >
            {isCreating
              ? t("accountDialog:aihubmixDefaultKeyPrompt.creating")
              : t("accountDialog:aihubmixDefaultKeyPrompt.confirm")}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <Alert
          variant="warning"
          title={t("accountDialog:aihubmixDefaultKeyPrompt.warningTitle")}
          description={t("accountDialog:aihubmixDefaultKeyPrompt.description", {
            accountName,
          })}
        />
        <p className="dark:text-dark-text-secondary text-sm text-gray-600">
          {t("accountDialog:aihubmixDefaultKeyPrompt.cancelHint")}
        </p>
      </div>
    </Modal>
  )
}
