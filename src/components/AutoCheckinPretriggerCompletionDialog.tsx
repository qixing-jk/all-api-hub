import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui"
import { Modal } from "~/components/ui/Dialog/Modal"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import type { AutoCheckinRunSummary } from "~/types/autoCheckin"
import {
  navigateWithinOptionsPage,
  openAutoCheckinPage,
} from "~/utils/navigation"

interface AutoCheckinPretriggerCompletionDialogProps {
  isOpen: boolean
  summary: AutoCheckinRunSummary | null
  pendingRetry: boolean
  onClose: () => void
}

const isOnOptionsPage = (): boolean => {
  if (typeof window === "undefined") {
    return false
  }
  try {
    const url = new URL(window.location.href)
    return /options\.html/i.test(url.pathname)
  } catch {
    return false
  }
}

/**
 * Completion dialog for a pre-triggered daily auto check-in run.
 *
 * This is shared by the automatic UI-open pre-trigger flow and any dev-only
 * debug/simulation controls so the summary UI stays consistent.
 */
export function AutoCheckinPretriggerCompletionDialog({
  isOpen,
  summary,
  pendingRetry,
  onClose,
}: AutoCheckinPretriggerCompletionDialogProps) {
  const { t } = useTranslation("autoCheckin")

  const header = (
    <div className="dark:text-dark-text-primary text-lg font-semibold text-gray-900">
      {t("uiOpenPretrigger.dialogTitle")}
    </div>
  )

  const handleViewDetails = async () => {
    const targetHash = `#${MENU_ITEM_IDS.AUTO_CHECKIN}`

    if (isOnOptionsPage()) {
      navigateWithinOptionsPage(targetHash)
    } else {
      await openAutoCheckinPage()
    }

    onClose()
  }

  const footer = (
    <div className="flex gap-2">
      <Button
        type="button"
        variant="secondary"
        className="flex-1"
        onClick={onClose}
      >
        {t("uiOpenPretrigger.close")}
      </Button>
      <Button
        type="button"
        variant="default"
        className="flex-1"
        onClick={handleViewDetails}
      >
        {t("uiOpenPretrigger.viewDetails")}
      </Button>
    </div>
  )

  return (
    <Modal isOpen={isOpen} onClose={onClose} header={header} footer={footer}>
      <div className="space-y-4">
        <p className="dark:text-dark-text-secondary text-sm text-gray-600">
          {t("uiOpenPretrigger.dialogDescription")}
        </p>

        {summary && (
          <div className="dark:bg-dark-bg-tertiary grid grid-cols-2 gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm dark:border-gray-700">
            <div className="flex items-center justify-between gap-3">
              <span className="dark:text-dark-text-secondary text-gray-600">
                {t("status.summary.eligible")}
              </span>
              <span className="dark:text-dark-text-primary font-medium text-gray-900">
                {summary.totalEligible}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="dark:text-dark-text-secondary text-gray-600">
                {t("status.summary.executed")}
              </span>
              <span className="dark:text-dark-text-primary font-medium text-gray-900">
                {summary.executed}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="dark:text-dark-text-secondary text-gray-600">
                {t("status.summary.success")}
              </span>
              <span className="dark:text-dark-text-primary font-medium text-gray-900">
                {summary.successCount}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="dark:text-dark-text-secondary text-gray-600">
                {t("status.summary.failed")}
              </span>
              <span className="dark:text-dark-text-primary font-medium text-gray-900">
                {summary.failedCount}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="dark:text-dark-text-secondary text-gray-600">
                {t("status.summary.skipped")}
              </span>
              <span className="dark:text-dark-text-primary font-medium text-gray-900">
                {summary.skippedCount}
              </span>
            </div>
            {pendingRetry && (
              <div className="col-span-2 text-xs text-amber-600 dark:text-amber-300">
                {t("status.pendingRetry")}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}

export default AutoCheckinPretriggerCompletionDialog
