import { useTranslation } from "react-i18next"

import { Button, WorkflowTransitionButton } from "~/components/ui"
import { Modal } from "~/components/ui/Dialog/Modal"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { trackProductAnalyticsActionStarted } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"
import type { AutoCheckinRunSummary } from "~/types/autoCheckin"
import { openAutoCheckinPage, pushWithinOptionsPage } from "~/utils/navigation"

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

const COMPLETION_DIALOG_ANALYTICS_CONTEXT = {
  featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
  surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAutoCheckinActionBar,
  entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
} as const

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

  const handleClose = () => {
    void trackProductAnalyticsActionStarted({
      ...COMPLETION_DIALOG_ANALYTICS_CONTEXT,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.CloseRedemptionBatchResult,
    })
    onClose()
  }

  const header = (
    <div className="dark:text-dark-text-primary text-lg font-semibold text-gray-900">
      {t("uiOpenPretrigger.dialogTitle")}
    </div>
  )

  const handleViewDetails = async () => {
    void trackProductAnalyticsActionStarted({
      ...COMPLETION_DIALOG_ANALYTICS_CONTEXT,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshAutoCheckinStatus,
    })
    const targetHash = `#${MENU_ITEM_IDS.AUTO_CHECKIN}`

    if (isOnOptionsPage()) {
      pushWithinOptionsPage(targetHash)
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
        onClick={handleClose}
      >
        {t("uiOpenPretrigger.close")}
      </Button>
      <WorkflowTransitionButton
        type="button"
        variant="default"
        className="flex-1"
        onClick={handleViewDetails}
      >
        {t("uiOpenPretrigger.viewDetails")}
      </WorkflowTransitionButton>
    </div>
  )

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      header={header}
      footer={footer}
    >
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
