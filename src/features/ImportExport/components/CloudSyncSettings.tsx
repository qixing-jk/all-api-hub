import { useState } from "react"

import type { CloudSyncProvider } from "~/types/webdav"

import WebDAVAutoSyncSettings from "./WebDAVAutoSyncSettings"
import WebDAVSettings from "./WebDAVSettings"

/** Composes provider configuration and automatic sync around one provider draft. */
export default function CloudSyncSettings() {
  const [providerPreview, setProviderPreview] = useState<CloudSyncProvider>()

  return (
    <section className="space-y-4">
      <WebDAVSettings onProviderDraftChange={setProviderPreview} />
      <WebDAVAutoSyncSettings providerPreview={providerPreview} />
    </section>
  )
}
