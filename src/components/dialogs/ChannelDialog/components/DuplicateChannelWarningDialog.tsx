import { TriangleAlert } from "lucide-react"
import { useTranslation } from "react-i18next"

import { ActionGroup } from "~/components/ui/ActionGroup"
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
      title={t("channelDialog:warnings.channelExists.title")}
      size="sm"
      header={
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <TriangleAlert className="text-warning-text h-5 w-5" />
            <h2 className="text-foreground text-lg font-semibold">
              {t("channelDialog:warnings.channelExists.title")}
            </h2>
          </div>
        </div>
      }
      footer={
        <ActionGroup
          layout="stack-on-narrow"
          className="gap-y-density-3 gap-x-3"
        >
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
        </ActionGroup>
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
