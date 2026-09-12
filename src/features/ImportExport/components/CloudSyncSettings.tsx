import { Cloud } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { BodySmall, Heading3 } from "~/components/ui"
import type { CloudSyncProvider } from "~/types/webdav"

import { CloudSyncSaveProvider } from "../hooks/useCloudSyncSaveQueue"
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
      className="space-y-4 border-t border-gray-200 pt-6 dark:border-gray-700"
    >
      <div className="space-y-1">
        <Heading3 as="h2" className="m-0 flex items-center gap-2 text-xl">
          <Cloud
            className="size-5 shrink-0 text-sky-600 dark:text-sky-400"
            aria-hidden="true"
          />
          {t("webdav.title")}
        </Heading3>
        <BodySmall className="m-0">{t("webdav.configDesc")}</BodySmall>
      </div>
      <CloudSyncSaveProvider>
        <div className="space-y-6">
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
      </CloudSyncSaveProvider>
    </section>
  )
}
