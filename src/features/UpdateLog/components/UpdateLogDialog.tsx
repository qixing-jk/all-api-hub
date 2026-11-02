import { Star } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button, Modal } from "~/components/ui"
import {
  useStarPromotionActive,
  useStarPromotionPromptImpression,
} from "~/features/StarPromotion/useStarPromotionActive"
import { UPDATE_LOG_DIALOG_TEST_IDS } from "~/features/UpdateLog/testIds"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { trackStarPromotionAction } from "~/services/productAnalytics/facts/starPromotion"
import { openStarPromotionRepository } from "~/services/starPromotion/openRepository"
import { createTab } from "~/utils/browser/tabs"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { getDocsChangelogUrl } from "~/utils/navigation/docsLinks"

export interface UpdateLogDialogProps {
  isOpen: boolean
  onClose: () => void
  version: string
}

const IFRAME_STATUSES = {
  Loading: "loading",
  Loaded: "loaded",
  Failed: "failed",
} as const
type IframeStatus = (typeof IFRAME_STATUSES)[keyof typeof IFRAME_STATUSES]
const IFRAME_LOAD_TIMEOUT_MS = 4_000
const logger = createLogger("UpdateLogDialog")

/**
 * A modal dialog that displays the update log for a specific version of the extension.
 */
export function UpdateLogDialog({
  isOpen,
  onClose,
  version,
}: UpdateLogDialogProps) {
  const { t, i18n } = useTranslation(["ui", "common"])
  const [iframeStatus, setIframeStatus] = useState<IframeStatus>(
    IFRAME_STATUSES.Loading,
  )
  const [starPromptDismissed, setStarPromptDismissed] = useState(false)

  // The update flow doubles as a star moment: the user is staring at evidence
  // of active development. Only show the ask while promotion is still active.
  const showStarPrompt = useStarPromotionActive(isOpen) && !starPromptDismissed
  useStarPromotionPromptImpression(showStarPrompt, {
    surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.UpdateLogDialogStarPrompt,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
  })

  const handleStarFromUpdateLog = useCallback(async () => {
    trackStarPromotionAction(PRODUCT_ANALYTICS_ACTION_IDS.ClickStarPromotion, {
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.UpdateLogDialogStarPrompt,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    if (await openStarPromotionRepository()) setStarPromptDismissed(true)
  }, [])

  const iframeUrl = useMemo(
    () => getDocsChangelogUrl(version, i18n.language),
    [version, i18n.language],
  )

  useEffect(() => {
    if (!isOpen) return

    setIframeStatus(IFRAME_STATUSES.Loading)

    const timeoutId = window.setTimeout(() => {
      setIframeStatus((prev) =>
        prev === IFRAME_STATUSES.Loading ? IFRAME_STATUSES.Failed : prev,
      )
    }, IFRAME_LOAD_TIMEOUT_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [isOpen, iframeUrl])

  const handleOpenFullChangelog = async () => {
    try {
      await createTab(iframeUrl, true)
    } catch (error) {
      logger.error(
        `Failed opening full changelog: ${getErrorMessage(error)}`,
        error,
      )
      throw error
    }
  }

  const header = (
    <div className="gap-density-3 flex w-full flex-wrap items-center justify-between pr-8">
      <h3 className="text-foreground text-lg font-semibold">
        {t("ui:dialog.updateLog.updatedTo", { version })}
      </h3>
    </div>
  )

  const footer = (
    <div className="gap-density-3 flex w-full flex-col sm:flex-row sm:items-center sm:justify-between">
      {showStarPrompt ? (
        <Button
          variant="link"
          size="sm"
          type="button"
          onClick={() => void handleStarFromUpdateLog()}
          leftIcon={<Star className="text-link h-4 w-4" />}
          className="h-auto w-fit justify-start p-0 text-left font-semibold whitespace-normal"
        >
          {t("ui:dialog.updateLog.starPrompt")}
        </Button>
      ) : null}
      <div
        data-testid={UPDATE_LOG_DIALOG_TEST_IDS.footer}
        className="flex justify-end sm:ml-auto"
      >
        <div
          data-testid={UPDATE_LOG_DIALOG_TEST_IDS.footerActions}
          className="gap-x-density-3 flex items-center justify-end"
        >
          <Button
            data-testid={UPDATE_LOG_DIALOG_TEST_IDS.closeButton}
            onClick={onClose}
            type="button"
            className="shrink-0"
          >
            {t("common:actions.close")}
          </Button>
          <Button
            data-testid={UPDATE_LOG_DIALOG_TEST_IDS.openFullChangelogButton}
            variant="outline"
            onClick={() => void handleOpenFullChangelog()}
            type="button"
            className="py-density-2 h-auto min-h-(--density-control) w-full text-center whitespace-normal sm:w-auto sm:whitespace-nowrap"
          >
            {t("ui:dialog.updateLog.openFullChangelog")}
          </Button>
        </div>
      </div>
    </div>
  )

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      header={header}
      footer={footer}
      size="xl"
      panelClassName="h-[95dvh] max-h-[95dvh] max-w-[100rem]"
    >
      <div
        data-testid={UPDATE_LOG_DIALOG_TEST_IDS.root}
        className="gap-y-density-3 flex min-h-0 flex-1 flex-col gap-x-3"
      >
        <div className="border-border min-h-0 flex-1 overflow-hidden rounded-lg border">
          <div className="relative h-full">
            {iframeStatus === IFRAME_STATUSES.Loading && (
              <div className="bg-card/60 absolute inset-0 z-10 flex items-center justify-center">
                <p className="dark:text-secondary-foreground text-muted-foreground text-sm">
                  {t("ui:dialog.updateLog.loading")}
                </p>
              </div>
            )}

            <iframe
              title={t("ui:dialog.updateLog.title")}
              src={iframeUrl}
              className="bg-card block h-full w-full"
              onLoad={() => setIframeStatus(IFRAME_STATUSES.Loaded)}
              sandbox="allow-same-origin allow-scripts"
            />
          </div>
        </div>

        {iframeStatus === IFRAME_STATUSES.Failed && (
          <p className="dark:text-secondary-foreground text-muted-foreground shrink-0 text-sm">
            {t("ui:dialog.updateLog.missingSection", { version })}
          </p>
        )}
      </div>
    </Modal>
  )
}
