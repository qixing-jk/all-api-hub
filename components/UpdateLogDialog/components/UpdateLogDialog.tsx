import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button, Modal } from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { createTab } from "~/utils/browserApi"
import { getDocsChangelogUrl } from "~/utils/docsLinks"
import { getErrorMessage } from "~/utils/error"
import { createLogger } from "~/utils/logger"

export interface UpdateLogDialogProps {
  isOpen: boolean
  onClose: () => void
  version: string
}

type IframeStatus = "loading" | "loaded" | "failed"

/**
 *
 */
export function UpdateLogDialog({
  isOpen,
  onClose,
  version,
}: UpdateLogDialogProps) {
  const { t } = useTranslation(["ui", "common"])
  const [iframeStatus, setIframeStatus] = useState<IframeStatus>("loading")
  const { openChangelogOnUpdate, updateOpenChangelogOnUpdate } =
    useUserPreferencesContext()
  const [autoOpenOverride, setAutoOpenOverride] = useState<boolean | null>(null)
  const [isSavingAutoOpen, setIsSavingAutoOpen] = useState(false)

  const autoOpenEnabled = autoOpenOverride ?? openChangelogOnUpdate

  const iframeUrl = useMemo(() => getDocsChangelogUrl(version), [version])

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
      await createTab(getDocsChangelogUrl(version), true)
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
      const success = await updateOpenChangelogOnUpdate(enabled)
      if (success) {
        setAutoOpenOverride(enabled)
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
      <h3 className="dark:text-dark-text-primary text-lg font-semibold text-gray-900">
        {t("ui:dialog.updateLog.title")}
      </h3>
      <p className="dark:text-dark-text-secondary mt-1 text-sm text-gray-500">
        {t("ui:dialog.updateLog.updatedTo", { version })}
      </p>
    </div>
  )

  const footer = (
    <div className="flex items-center justify-between gap-3">
      <Button
        data-testid="update-log-dialog-auto-open-toggle"
        variant="outline"
        disabled={isSavingAutoOpen}
        onClick={() => void handleSetAutoOpenEnabled(!autoOpenEnabled)}
        type="button"
      >
        {autoOpenEnabled
          ? t("ui:dialog.updateLog.disableAutoOpen")
          : t("ui:dialog.updateLog.enableAutoOpen")}
      </Button>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onClose} type="button">
          {t("common:actions.close")}
        </Button>
        <Button onClick={() => void handleOpenFullChangelog()} type="button">
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
      size="lg"
    >
      <div data-testid="update-log-dialog" className="space-y-3">
        <div className="dark:border-dark-bg-tertiary overflow-hidden rounded-lg border border-gray-200">
          <div className="relative">
            {iframeStatus === "loading" && (
              <div className="dark:bg-dark-bg-secondary/60 absolute inset-0 z-10 flex items-center justify-center bg-white/60">
                <p className="dark:text-dark-text-secondary text-sm text-gray-600">
                  {t("ui:dialog.updateLog.loading")}
                </p>
              </div>
            )}

            <iframe
              title={t("ui:dialog.updateLog.title")}
              src={iframeUrl}
              className="dark:bg-dark-bg-secondary h-[60vh] w-full bg-white"
              onLoad={() => setIframeStatus("loaded")}
              sandbox="allow-same-origin allow-scripts"
            />
          </div>
        </div>

        {iframeStatus === "failed" && (
          <p className="dark:text-dark-text-secondary text-sm text-gray-600">
            {t("ui:dialog.updateLog.missingSection", { version })}
          </p>
        )}
      </div>
    </Modal>
  )
}

export default UpdateLogDialog
