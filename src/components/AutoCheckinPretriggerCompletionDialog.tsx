import { useTranslation } from "react-i18next"

import { Button, WorkflowTransitionButton } from "~/components/ui"
import { ActionGroup } from "~/components/ui/ActionGroup"
import { Modal } from "~/components/ui/Dialog/Modal"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { trackProductAnalyticsActionStarted } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
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
    <div className="text-foreground text-lg font-semibold">
      {t("uiOpenPretrigger.dialogTitle")}
    </div>
  )

  const handleViewDetails = async () => {
    void trackProductAnalyticsActionStarted({
      ...COMPLETION_DIALOG_ANALYTICS_CONTEXT,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.OpenAutoCheckinSettingsPage,
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
    <ActionGroup layout="stack-on-narrow">
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
    </ActionGroup>
  )

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      header={header}
      footer={footer}
    >
      <div className="space-y-density-4">
        <p className="dark:text-secondary-foreground text-muted-foreground text-sm">
          {t("uiOpenPretrigger.dialogDescription")}
        </p>

        {summary && (
          <div className="dark:bg-secondary border-border bg-surface-subtle gap-y-density-3 py-density-3 grid grid-cols-2 gap-x-3 rounded-lg border px-3 text-sm">
            <div className="gap-y-density-3 flex items-center justify-between gap-x-3">
              <span className="dark:text-secondary-foreground text-muted-foreground">
                {t("status.summary.eligible")}
              </span>
              <span className="text-foreground font-medium">
                {summary.totalEligible}
              </span>
            </div>
            <div className="gap-y-density-3 flex items-center justify-between gap-x-3">
              <span className="dark:text-secondary-foreground text-muted-foreground">
                {t("status.summary.executed")}
              </span>
              <span className="text-foreground font-medium">
                {summary.executed}
              </span>
            </div>
            <div className="gap-y-density-3 flex items-center justify-between gap-x-3">
              <span className="dark:text-secondary-foreground text-muted-foreground">
                {t("status.summary.success")}
              </span>
              <span className="text-foreground font-medium">
                {summary.successCount}
              </span>
            </div>
            <div className="gap-y-density-3 flex items-center justify-between gap-x-3">
              <span className="dark:text-secondary-foreground text-muted-foreground">
                {t("status.summary.failed")}
              </span>
              <span className="text-foreground font-medium">
                {summary.failedCount}
              </span>
            </div>
            <div className="gap-y-density-3 flex items-center justify-between gap-x-3">
              <span className="dark:text-secondary-foreground text-muted-foreground">
                {t("status.summary.skipped")}
              </span>
              <span className="text-foreground font-medium">
                {summary.skippedCount}
              </span>
            </div>
            {pendingRetry && (
              <div className="text-warning-text col-span-2 text-xs">
                {t("status.pendingRetry")}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
