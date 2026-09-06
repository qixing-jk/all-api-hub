import { useState } from "react"
import { useTranslation } from "react-i18next"

import { BodySmall, Heading3 } from "~/components/ui"
import type { CloudSyncProvider } from "~/types/webdav"

import WebDAVAutoSyncSettings from "./WebDAVAutoSyncSettings"
import WebDAVSettings from "./WebDAVSettings"

/** Composes provider configuration and automatic sync around one provider draft. */
export default function CloudSyncSettings() {
  const { t } = useTranslation("importExport")
  const [providerPreview, setProviderPreview] = useState<CloudSyncProvider>()
  const [gistEncryptionPasswordError, setGistEncryptionPasswordError] =
    useState<string>()

  return (
    <section
      id="cloud-sync"
      className="dark:bg-dark-bg-secondary space-y-4 rounded-xl border border-gray-200 bg-white p-4 sm:p-5 dark:border-gray-700"
    >
      <div className="space-y-1">
        <Heading3 className="m-0">{t("webdav.title")}</Heading3>
        <BodySmall className="m-0">{t("webdav.configDesc")}</BodySmall>
      </div>
      <div className="space-y-4">
        <WebDAVSettings
          onProviderDraftChange={setProviderPreview}
          gistEncryptionPasswordError={gistEncryptionPasswordError}
          onGistEncryptionPasswordErrorChange={setGistEncryptionPasswordError}
        />
        <WebDAVAutoSyncSettings
          providerPreview={providerPreview}
          onGistEncryptionPasswordErrorChange={setGistEncryptionPasswordError}
        />
      </div>
    </section>
  )
}
