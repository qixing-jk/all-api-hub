import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Alert, BodySmall, Button, Heading4, Modal } from "~/components/ui"
import { ProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import {
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
} from "~/services/productAnalytics/contracts"
import { CLOUD_SYNC_PROVIDERS } from "~/types/webdav"

import type { useWebdavBackupUpload } from "../hooks/useWebdavBackupUpload"
import type { WebdavConfigState } from "../hooks/useWebdavConfig"
import { WEBDAV_TARGET_IDS } from "../searchTargets"
import { IMPORT_EXPORT_TEST_IDS } from "../testIds"
import { webDavSettingsSurface } from "./webDavAnalytics"

/** Own manual direction confirmation and display upload rebuild recovery. */
export function WebdavManualActions({
  config,
  upload,
  downloading,
  onDownload,
}: {
  config: WebdavConfigState
  upload: ReturnType<typeof useWebdavBackupUpload>
  downloading: boolean
  onDownload: () => Promise<void>
}) {
  const { t } = useTranslation("importExport")
  const { provider, githubGistId, uploadConfigFilled, webdavConfigFilled } =
    config
  const {
    uploading,
    rebuildDialogOpen,
    setRebuildDialogOpen,
    rebuildPending,
    uploadWebdavBackup,
    handleConfirmRebuildBackup,
  } = upload
  const [pendingManualAction, setPendingManualAction] = useState<
    "upload" | "download" | null
  >(null)

  const requestManualAction = (action: "upload" | "download") => {
    if (
      action === "upload" &&
      provider === CLOUD_SYNC_PROVIDERS.GITHUB_GIST &&
      !githubGistId
    ) {
      void uploadWebdavBackup()
      return
    }
    setPendingManualAction(action)
  }
  const confirmManualAction = async () => {
    const action = pendingManualAction
    if (!action) return
    setPendingManualAction(null)
    if (action === "upload") await uploadWebdavBackup()
    else await onDownload()
  }
  return (
    <>
      <ProductAnalyticsScope
        entrypoint={PRODUCT_ANALYTICS_ENTRYPOINTS.Options}
        featureId={PRODUCT_ANALYTICS_FEATURE_IDS.WebDavSync}
        surfaceId={webDavSettingsSurface}
      >
        <div className="flex flex-wrap gap-3">
          <div
            id={
              provider === CLOUD_SYNC_PROVIDERS.GITHUB_GIST
                ? WEBDAV_TARGET_IDS.gistUpload
                : undefined
            }
            className="max-w-full"
          >
            <Button
              id={WEBDAV_TARGET_IDS.uploadBackup}
              data-testid={IMPORT_EXPORT_TEST_IDS.webdavUploadBackupButton}
              onClick={() => requestManualAction("upload")}
              disabled={!uploadConfigFilled}
              loading={uploading}
              variant="default"
              size="sm"
            >
              {uploading
                ? t("common:status.uploading")
                : t(
                    provider === CLOUD_SYNC_PROVIDERS.GITHUB_GIST
                      ? "webdav.gist.upload"
                      : "webdav.uploadBackup",
                  )}
            </Button>
          </div>

          <div className="max-w-full">
            <Button
              id={WEBDAV_TARGET_IDS.downloadImport}
              data-testid={IMPORT_EXPORT_TEST_IDS.webdavDownloadImportButton}
              onClick={() => requestManualAction("download")}
              disabled={!webdavConfigFilled}
              loading={downloading}
              variant="secondary"
              size="sm"
            >
              {downloading
                ? t("common:status.processing")
                : t(
                    provider === CLOUD_SYNC_PROVIDERS.GITHUB_GIST
                      ? "webdav.gist.downloadImport"
                      : "webdav.downloadImport",
                  )}
            </Button>
          </div>
        </div>
      </ProductAnalyticsScope>

      <Modal
        isOpen={pendingManualAction !== null}
        onClose={() => {
          if (!uploading && !downloading) setPendingManualAction(null)
        }}
        size="md"
        header={
          <div className="space-y-1">
            <Heading4 className="m-0">
              {t(
                pendingManualAction === "upload"
                  ? "webdav.manual.confirmUploadTitle"
                  : "webdav.manual.confirmDownloadTitle",
              )}
            </Heading4>
            <BodySmall className="m-0">
              {t(
                pendingManualAction === "upload"
                  ? "webdav.manual.confirmUploadDescription"
                  : "webdav.manual.confirmDownloadDescription",
              )}
            </BodySmall>
          </div>
        }
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPendingManualAction(null)}
              disabled={uploading || downloading}
              data-testid={IMPORT_EXPORT_TEST_IDS.webdavManualCancelButton}
            >
              {t("webdav.manual.confirmCancel")}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => void confirmManualAction()}
              loading={uploading || downloading}
              data-testid={IMPORT_EXPORT_TEST_IDS.webdavManualConfirmButton}
            >
              {t("webdav.manual.confirmContinue")}
            </Button>
          </div>
        }
      >
        <Alert
          variant="warning"
          description={t("webdav.manual.directionWarning")}
        />
      </Modal>

      <Modal
        isOpen={rebuildDialogOpen}
        onClose={() => {
          if (uploading || rebuildPending) return
          setRebuildDialogOpen(false)
        }}
        size="md"
        header={
          <div className="space-y-1">
            <Heading4 className="m-0">
              {t("webdav.rebuildDialog.title")}
            </Heading4>
            <BodySmall className="m-0">
              {t("webdav.rebuildDialog.description")}
            </BodySmall>
          </div>
        }
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setRebuildDialogOpen(false)}
              disabled={uploading || rebuildPending}
            >
              {t("webdav.rebuildDialog.cancel")}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirmRebuildBackup}
              loading={uploading || rebuildPending}
            >
              {rebuildPending
                ? t("common:status.processing")
                : uploading
                  ? t("common:status.uploading")
                  : t("webdav.rebuildDialog.confirm")}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Alert
            variant="warning"
            title={t("webdav.rebuildDialog.warningTitle")}
            description={t("webdav.rebuildDialog.warningDescription")}
          />
          <BodySmall className="m-0">
            {t("webdav.rebuildDialog.fullSelectionNote")}
          </BodySmall>
        </div>
      </Modal>
    </>
  )
}
