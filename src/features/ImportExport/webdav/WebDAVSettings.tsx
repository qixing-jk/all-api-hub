import { useTranslation } from "react-i18next"

import { Card } from "~/components/ui"
import { WEBDAV_TARGET_IDS } from "~/features/ImportExport/searchTargets"
import { useWebdavBackupImport } from "~/features/ImportExport/webdav/useWebdavBackupImport"
import { useWebdavBackupUpload } from "~/features/ImportExport/webdav/useWebdavBackupUpload"
import { useWebdavConfig } from "~/features/ImportExport/webdav/useWebdavConfig"
import { WebdavConnectionSettings } from "~/features/ImportExport/webdav/WebdavConnectionSettings"
import { WebDAVDecryptPasswordModal } from "~/features/ImportExport/webdav/WebDAVDecryptPasswordModal"
import { WebdavManualActions } from "~/features/ImportExport/webdav/WebdavManualActions"
import type { CloudSyncProvider } from "~/types/webdav"

/** Reports the currently selected provider draft to the composed sync page. */
interface WebDAVSettingsProps {
  onProviderDraftChange?: (provider: CloudSyncProvider) => void
  gistEncryptionPasswordError?: string
  onGistEncryptionPasswordErrorChange?: (error?: string) => void
}

/** Compose provider settings and independent manual upload/import workflows. */
export default function WebDAVSettings(options: WebDAVSettingsProps = {}) {
  const { t } = useTranslation("importExport")
  const config = useWebdavConfig(options)
  const upload = useWebdavBackupUpload(config)
  const download = useWebdavBackupImport(config)
  return (
    <>
      <Card
        id={WEBDAV_TARGET_IDS.root}
        padding="none"
        role="region"
        aria-label={t("webdav.connection.title")}
      >
        <WebdavConnectionSettings
          config={config}
          backupActions={
            <WebdavManualActions
              config={config}
              upload={upload}
              downloading={download.downloading}
              onDownload={download.handleDownloadAndImport}
            />
          }
        />
      </Card>
      <WebDAVDecryptPasswordModal
        isOpen={download.decryptDialogOpen}
        decrypting={download.decrypting}
        password={download.decryptPassword}
        onPasswordChange={download.setDecryptPassword}
        savePassword={download.saveDecryptPassword}
        onSavePasswordChange={download.setSaveDecryptPassword}
        onClose={() => download.setDecryptDialogOpen(false)}
        onDecryptAndImport={download.handleDecryptAndImport}
      />
    </>
  )
}
