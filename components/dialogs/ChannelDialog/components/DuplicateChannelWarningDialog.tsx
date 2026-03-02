import { DialogTitle } from "@headlessui/react"
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { Alert } from "~/components/ui/Alert"
import { Button } from "~/components/ui/button"
import { Modal } from "~/components/ui/Dialog/Modal"

export interface DuplicateChannelWarningDialogProps {
  isOpen: boolean
  existingChannelName?: string | null
  onCancel: () => void
  onContinue: () => void
}

/**
 * DuplicateChannelWarningDialog warns the user when a similar channel already exists in the managed site.
 * It allows the user to either cancel or proceed with creating another channel.
 */
export function DuplicateChannelWarningDialog({
  isOpen,
  existingChannelName,
  onCancel,
  onContinue,
}: DuplicateChannelWarningDialogProps) {
  const { t } = useTranslation(["channelDialog", "common"])

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      size="sm"
      header={
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
            <DialogTitle className="dark:text-dark-text-primary text-lg font-semibold text-gray-900">
              {t("channelDialog:warnings.channelExists.title")}
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
          >
            {t("common:actions.cancel")}
          </Button>
          <Button
            type="button"
            onClick={onContinue}
            variant="warning"
            className="flex-1"
          >
            {t("channelDialog:warnings.channelExists.actions.continue")}
          </Button>
        </div>
      }
    >
      <Alert
        variant="warning"
        title={t("channelDialog:warnings.channelExists.warningTitle")}
        description={t("channelDialog:warnings.channelExists.description", {
          channelName: existingChannelName ?? "",
        })}
      />
    </Modal>
  )
}

export default DuplicateChannelWarningDialog
