import { Star } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button, Modal } from "~/components/ui"
import { REPO_URL } from "~/constants/about"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import {
  useStarPromotionActive,
  useStarPromotionPromptImpression,
} from "~/features/StarPromotion/useStarPromotionActive"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { trackStarPromotionAction } from "~/services/productAnalytics/starPromotion"
import { starPromotionState } from "~/services/starPromotion/state"
import { createTab } from "~/utils/browser/browserApi"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { showUpdateToast } from "~/utils/feedback/preferenceFeedback"
import { getDocsChangelogUrl } from "~/utils/navigation/docsLinks"

import { UPDATE_LOG_DIALOG_TEST_IDS } from "../testIds"

/**
 * Unified logger scoped to the update log dialog.
 */
const logger = createLogger("UpdateLogDialog")

export interface UpdateLogDialogProps {
  isOpen: boolean
  onClose: () => void
  version: string
}

type IframeStatus = "loading" | "loaded" | "failed"

/**
 * A modal dialog that displays the update log for a specific version of the extension.
 */
export function UpdateLogDialog({
  isOpen,
  onClose,
  version,
}: UpdateLogDialogProps) {
  const { t, i18n } = useTranslation(["ui", "common"])
  const [iframeStatus, setIframeStatus] = useState<IframeStatus>("loading")
  const { openChangelogOnUpdate, updateOpenChangelogOnUpdate } =
    useUserPreferencesContext()
  const [autoOpenOverride, setAutoOpenOverride] = useState<boolean | null>(null)
  const [isSavingAutoOpen, setIsSavingAutoOpen] = useState(false)
  const [starPromptDismissed, setStarPromptDismissed] = useState(false)

  const autoOpenEnabled = autoOpenOverride ?? openChangelogOnUpdate
  // The update flow doubles as a star moment: the user is staring at evidence
  // of active development. Only show the ask while promotion is still active.
  const showStarPrompt = useStarPromotionActive(isOpen) && !starPromptDismissed
  useStarPromotionPromptImpression(showStarPrompt, {
    surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.UpdateLogDialogStarPrompt,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
  })

  const handleStarFromUpdateLog = useCallback(async () => {
    setStarPromptDismissed(true)
    trackStarPromotionAction(PRODUCT_ANALYTICS_ACTION_IDS.ClickStarPromotion, {
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.UpdateLogDialogStarPrompt,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    void starPromotionState.markCompleted()
    try {
      await createTab(REPO_URL, true)
    } catch (error) {
      logger.error(
        `Failed opening repository after star click: ${getErrorMessage(error)}`,
        error,
      )
    }
  }, [])

  const iframeUrl = useMemo(
    () => getDocsChangelogUrl(version, i18n.language),
    [version, i18n.language],
  )

  useEffect(() => {
    if (!isOpen) return

    setIframeStatus("loading")

    const timeoutId = window.setTimeout(() => {
      setIframeStatus((prev) => (prev === "loading" ? "failed" : prev))
    }, 4_000)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [isOpen, iframeUrl])

  const handleOpenFullChangelog = async () => {
    try {
      await createTab(iframeUrl, true)
    } catch (error) {
      const logger = createLogger("UpdateLogDialog")
      logger.error(
        `Failed opening full changelog: ${getErrorMessage(error)}`,
        error,
      )
      throw error
    }
  }

  const handleSetAutoOpenEnabled = async (enabled: boolean) => {
    if (isSavingAutoOpen) return

    setIsSavingAutoOpen(true)
    try {
      const result = await updateOpenChangelogOnUpdate(enabled)
      if (result.ok) {
        setAutoOpenOverride(enabled)
      } else {
        showUpdateToast(result, t("ui:dialog.updateLog.autoOpenSetting"))
      }
    } catch (error) {
      const logger = createLogger("UpdateLogDialog")
      logger.error(
        `Failed saving auto-open setting for version ${version}: ${getErrorMessage(error)}`,
        error,
      )
      throw error
    } finally {
      setIsSavingAutoOpen(false)
    }
  }

  const header = (
    <div className="pr-8">
      <h3 className="text-foreground text-lg font-semibold">
        {t("ui:dialog.updateLog.title")}
      </h3>
      <p className="dark:text-secondary-foreground text-muted-foreground mt-density-1 text-sm">
        {t("ui:dialog.updateLog.updatedTo", { version })}
      </p>
    </div>
  )

  const footer = (
    <div className="gap-y-density-2 flex w-full flex-col">
      {showStarPrompt ? (
        <Button
          variant="link"
          size="sm"
          type="button"
          onClick={() => void handleStarFromUpdateLog()}
          leftIcon={<Star className="text-link h-4 w-4" />}
          className="h-auto justify-center py-0 text-left sm:justify-start"
        >
          {t("ui:dialog.updateLog.starPrompt")}
        </Button>
      ) : null}
      <div
        data-testid={UPDATE_LOG_DIALOG_TEST_IDS.footer}
        className="gap-y-density-3 flex flex-col gap-x-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <Button
          data-testid={UPDATE_LOG_DIALOG_TEST_IDS.autoOpenToggle}
          variant="outline"
          loading={isSavingAutoOpen}
          onClick={() => void handleSetAutoOpenEnabled(!autoOpenEnabled)}
          type="button"
          className="py-density-2 h-auto min-h-(--density-control) w-full text-left whitespace-normal sm:w-auto sm:text-center sm:whitespace-nowrap"
        >
          {isSavingAutoOpen
            ? autoOpenEnabled
              ? t("common:status.disabling")
              : t("common:status.enabling")
            : autoOpenEnabled
              ? t("ui:dialog.updateLog.disableAutoOpen")
              : t("ui:dialog.updateLog.enableAutoOpen")}
        </Button>

        <div
          data-testid={UPDATE_LOG_DIALOG_TEST_IDS.footerActions}
          className="gap-y-density-3 flex flex-col gap-x-3 sm:flex-row sm:justify-end"
        >
          <Button
            data-testid={UPDATE_LOG_DIALOG_TEST_IDS.closeButton}
            variant="outline"
            onClick={onClose}
            type="button"
            className="w-full sm:w-auto"
          >
            {t("common:actions.close")}
          </Button>
          <Button
            data-testid={UPDATE_LOG_DIALOG_TEST_IDS.openFullChangelogButton}
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
            {iframeStatus === "loading" && (
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
              onLoad={() => setIframeStatus("loaded")}
              sandbox="allow-same-origin allow-scripts"
            />
          </div>
        </div>

        {iframeStatus === "failed" && (
          <p className="dark:text-secondary-foreground text-muted-foreground shrink-0 text-sm">
            {t("ui:dialog.updateLog.missingSection", { version })}
          </p>
        )}
      </div>
    </Modal>
  )
}
