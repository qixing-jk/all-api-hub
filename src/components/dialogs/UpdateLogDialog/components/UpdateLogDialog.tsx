import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button, Modal } from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { createTab } from "~/utils/browser/browserApi"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { showUpdateToast } from "~/utils/feedback/preferenceFeedback"
import { getDocsChangelogUrl } from "~/utils/navigation/docsLinks"

import { UPDATE_LOG_DIALOG_TEST_IDS } from "../testIds"

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

  const autoOpenEnabled = autoOpenOverride ?? openChangelogOnUpdate

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
      <p className="dark:text-secondary-foreground text-muted-foreground mt-1 text-sm">
        {t("ui:dialog.updateLog.updatedTo", { version })}
      </p>
    </div>
  )

  const footer = (
    <div
      data-testid={UPDATE_LOG_DIALOG_TEST_IDS.footer}
      className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <Button
        data-testid={UPDATE_LOG_DIALOG_TEST_IDS.autoOpenToggle}
        variant="outline"
        loading={isSavingAutoOpen}
        onClick={() => void handleSetAutoOpenEnabled(!autoOpenEnabled)}
        type="button"
        className="h-auto min-h-9 w-full py-2 text-left whitespace-normal sm:w-auto sm:text-center sm:whitespace-nowrap"
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
        className="flex flex-col gap-3 sm:flex-row sm:justify-end"
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
          className="h-auto min-h-9 w-full py-2 text-center whitespace-normal sm:w-auto sm:whitespace-nowrap"
        >
          {t("ui:dialog.updateLog.openFullChangelog")}
        </Button>
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
        className="flex min-h-0 flex-1 flex-col gap-3"
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
