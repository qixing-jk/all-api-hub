import { useEffect, useId, useState } from "react"
import { useTranslation } from "react-i18next"

import { Alert, Button } from "~/components/ui"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import type { UserGroupInfo } from "~/services/accountTokens/tokenProvisioningModel"

import { TokenGroupSelectionField } from "./TokenGroupSelectionField"

interface DefaultTokenGroupSelectionDialogProps {
  isOpen: boolean
  allowedGroups: readonly string[]
  groups: Record<string, UserGroupInfo>
  suggestedGroup: string
  isCreating: boolean
  error: string | null
  onCancel: () => void
  onConfirm: (group: string) => void
}

/** Confirms the group required by default-token quick creation without loading the full token editor. */
export function DefaultTokenGroupSelectionDialog({
  isOpen,
  allowedGroups,
  groups,
  suggestedGroup,
  isCreating,
  error,
  onCancel,
  onConfirm,
}: DefaultTokenGroupSelectionDialogProps) {
  const { t } = useTranslation(["messages", "keyManagement", "common"])
  const groupFieldId = useId()
  const [selectedGroup, setSelectedGroup] = useState("")

  useEffect(() => {
    if (!isOpen) return
    setSelectedGroup(suggestedGroup)
  }, [isOpen, suggestedGroup])

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isCreating) onCancel()
      }}
    >
      <DialogContent
        className="sm:max-w-sm"
        showCloseButton={!isCreating}
        onEscapeKeyDown={(event) => {
          if (isCreating) event.preventDefault()
        }}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            {t("messages:tokenProvisioning.selectGroupTitle")}
          </DialogTitle>
          <DialogDescription>
            {t("messages:tokenProvisioning.createRequiresGroupSelection")}
          </DialogDescription>
        </DialogHeader>

        <TokenGroupSelectionField
          id={groupFieldId}
          group={selectedGroup}
          onChange={setSelectedGroup}
          groups={groups}
          allowedGroups={allowedGroups}
          required
          disabled={isCreating}
        />
        {error ? (
          <Alert compact variant="destructive" description={error} />
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            onClick={onCancel}
            disabled={isCreating}
            variant="secondary"
          >
            {t("common:actions.cancel")}
          </Button>
          <Button
            type="button"
            onClick={() => onConfirm(selectedGroup)}
            disabled={!selectedGroup}
            loading={isCreating}
          >
            {isCreating
              ? t("common:status.creating")
              : t("keyManagement:dialog.createToken")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
