import { useId } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { Textarea } from "~/components/ui/Textarea"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"

interface InviteLinkManualCopyDialogProps {
  payload: string | null
  onClose: () => void
}

/** Keeps generated invite links recoverable when browser clipboard access fails. */
export function InviteLinkManualCopyDialog({
  payload,
  onClose,
}: InviteLinkManualCopyDialogProps) {
  const { t } = useTranslation(["account", "common"])
  const textareaId = useId()

  return (
    <Dialog
      open={payload !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.inviteLinkManualCopyDialog}
      >
        <DialogHeader>
          <DialogTitle>{t("inviteLinkManualCopy.title")}</DialogTitle>
          <DialogDescription>
            {t("inviteLinkManualCopy.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <label htmlFor={textareaId} className="text-sm font-medium">
            {t("inviteLinkManualCopy.label")}
          </label>
          <Textarea
            id={textareaId}
            value={payload ?? ""}
            readOnly
            autoFocus
            rows={Math.min(10, Math.max(3, (payload ?? "").split("\n").length))}
            className="font-mono text-xs"
            onFocus={(event) => event.currentTarget.select()}
            data-testid={
              ACCOUNT_MANAGEMENT_TEST_IDS.inviteLinkManualCopyTextarea
            }
          />
        </div>

        <DialogFooter>
          <Button type="button" onClick={onClose}>
            {t("common:actions.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
