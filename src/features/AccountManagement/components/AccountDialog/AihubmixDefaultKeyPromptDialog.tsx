import { KeyRound } from "lucide-react"
import { useTranslation } from "react-i18next"

import { ActionGroup } from "~/components/ui/ActionGroup"
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
      title={t("accountDialog:aihubmixDefaultKeyPrompt.title")}
      closeOnBackdropClick={false}
      size="sm"
      header={
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <KeyRound className="text-warning-text h-5 w-5" />
            <h2 className="text-foreground text-lg font-semibold">
              {t("accountDialog:aihubmixDefaultKeyPrompt.title")}
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
            disabled={isCreating}
          >
            {t("accountDialog:aihubmixDefaultKeyPrompt.cancel")}
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            variant="warning"
            className="flex-1"
            loading={isCreating}
          >
            {isCreating
              ? t("accountDialog:aihubmixDefaultKeyPrompt.creating")
              : t("accountDialog:aihubmixDefaultKeyPrompt.confirm")}
          </Button>
        </ActionGroup>
      }
    >
      <div className="space-y-density-3">
        <Alert
          variant="warning"
          title={t("accountDialog:aihubmixDefaultKeyPrompt.warningTitle")}
          description={t("accountDialog:aihubmixDefaultKeyPrompt.description", {
            accountName,
          })}
        />
        <p className="dark:text-secondary-foreground text-muted-foreground text-sm">
          {t("accountDialog:aihubmixDefaultKeyPrompt.cancelHint")}
        </p>
      </div>
    </Modal>
  )
}
