import { useTranslation } from "react-i18next"

import { Card } from "~/components/ui"
import type { CloudSyncProvider } from "~/types/webdav"

import { useWebdavBackupImport } from "../hooks/useWebdavBackupImport"
import { useWebdavBackupUpload } from "../hooks/useWebdavBackupUpload"
import { useWebdavConfig } from "../hooks/useWebdavConfig"
import { WEBDAV_TARGET_IDS } from "../searchTargets"
import { WebdavConnectionSettings } from "./WebdavConnectionSettings"
import { WebDAVDecryptPasswordModal } from "./WebDAVDecryptPasswordModal"
import { WebdavManualActions } from "./WebdavManualActions"

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
