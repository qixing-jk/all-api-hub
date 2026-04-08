import { useCallback, useMemo } from "react"
import { useTranslation } from "react-i18next"

import {
  Button,
  Heading4,
  Modal,
  WorkflowTransitionButton,
} from "~/components/ui"
import type { TempWindowFallbackIssue } from "~/features/AccountManagement/utils/tempWindowFallbackReminder"
import { TEMP_WINDOW_HEALTH_STATUS_CODES } from "~/types"
import {
  getProtectionBypassUiVariant,
  ProtectionBypassUiVariants,
} from "~/utils/browser/protectionBypass"
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

  const protectionBypassUiVariant = getProtectionBypassUiVariant()
  const isCookieInterceptorVariant =
    protectionBypassUiVariant ===
    ProtectionBypassUiVariants.TempWindowWithCookieInterceptor

  const title = isCookieInterceptorVariant
    ? t("ui:dialog.tempWindowFallbackReminder.titleWithCookieInterceptor")
    : t("ui:dialog.tempWindowFallbackReminder.titleTempWindowOnly")

  const description = useMemo(() => {
    if (issue.code === TEMP_WINDOW_HEALTH_STATUS_CODES.PERMISSION_REQUIRED) {
      return isCookieInterceptorVariant
        ? t(
            "ui:dialog.tempWindowFallbackReminder.descriptionPermissionWithCookieInterceptor",
            {
              accountName: issue.accountName,
            },
          )
        : t(
            "ui:dialog.tempWindowFallbackReminder.descriptionPermissionTempWindowOnly",
            {
              accountName: issue.accountName,
            },
          )
    }

    return isCookieInterceptorVariant
      ? t(
          "ui:dialog.tempWindowFallbackReminder.descriptionDisabledWithCookieInterceptor",
          {
            accountName: issue.accountName,
          },
        )
      : t(
          "ui:dialog.tempWindowFallbackReminder.descriptionDisabledTempWindowOnly",
          {
            accountName: issue.accountName,
          },
        )
  }, [isCookieInterceptorVariant, issue.accountName, issue.code, t])

  const handleNotNow = useCallback(async () => {
    onClose()
  }, [onClose])

  const handleOpenSettings = useCallback(async () => {
    onClose()
    await openSettingsTab(issue.settingsTab, { preserveHistory: true })
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
          <WorkflowTransitionButton onClick={handleOpenSettings}>
            {t("ui:dialog.tempWindowFallbackReminder.actions.openSettings")}
          </WorkflowTransitionButton>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-sm leading-relaxed">{description}</p>
      </div>
    </Modal>
  )
}
