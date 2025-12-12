import { useCallback, useMemo } from "react"
import { useTranslation } from "react-i18next"

import { Button, Heading4, Modal } from "~/components/ui"
import type { TempWindowFallbackIssue } from "~/features/AccountManagement/utils/tempWindowFallbackReminder"
import { TEMP_WINDOW_HEALTH_STATUS_CODES } from "~/types"
import { openSettingsTab } from "~/utils/navigation"

export interface TempWindowFallbackReminderDialogProps {
  isOpen: boolean
  issue: TempWindowFallbackIssue
  onClose: () => void
  onNeverRemind: () => Promise<void> | void
}

/**
 * Reminder dialog shown when refresh health indicates temp-window fallback is required,
 * but is blocked by disabled configuration or missing permissions.
 */
export function TempWindowFallbackReminderDialog({
  isOpen,
  issue,
  onClose,
  onNeverRemind,
}: TempWindowFallbackReminderDialogProps) {
  const { t } = useTranslation(["ui", "common"])

  const title = t("ui:dialog.tempWindowFallbackReminder.title")

  const description = useMemo(() => {
    if (issue.code === TEMP_WINDOW_HEALTH_STATUS_CODES.PERMISSION_REQUIRED) {
      return t("ui:dialog.tempWindowFallbackReminder.descriptionPermission", {
        accountName: issue.accountName,
      })
    }

    return t("ui:dialog.tempWindowFallbackReminder.descriptionDisabled", {
      accountName: issue.accountName,
    })
  }, [issue.accountName, issue.code, t])

  const handleNotNow = useCallback(async () => {
    onClose()
  }, [onClose])

  const handleOpenSettings = useCallback(async () => {
    onClose()
    await openSettingsTab(issue.settingsTab)
  }, [issue.settingsTab, onClose])

  const handleNeverRemind = useCallback(async () => {
    await onNeverRemind()
    onClose()
  }, [onClose, onNeverRemind])

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleNotNow}
      header={<Heading4>{title}</Heading4>}
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
          <Button variant="outline" onClick={handleNeverRemind}>
            {t("ui:dialog.tempWindowFallbackReminder.actions.neverRemind")}
          </Button>
          <Button variant="outline" onClick={handleNotNow}>
            {t("ui:dialog.tempWindowFallbackReminder.actions.notNow")}
          </Button>
          <Button onClick={handleOpenSettings}>
            {t("ui:dialog.tempWindowFallbackReminder.actions.openSettings")}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-sm leading-relaxed">{description}</p>
      </div>
    </Modal>
  )
}
