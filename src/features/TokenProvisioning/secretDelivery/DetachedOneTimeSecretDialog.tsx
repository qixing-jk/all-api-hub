import type { i18n } from "i18next"
import type { ComponentProps } from "react"
import { createRoot } from "react-dom/client"
import { I18nextProvider } from "react-i18next"

import { OneTimeSecretDialog } from "~/features/TokenProvisioning/secretDelivery/OneTimeSecretDialog"

/** Keeps a returned secret in a foreground dialog after its original owner leaves. */
export function presentDetachedOneTimeSecret(
  props: Pick<
    ComponentProps<typeof OneTimeSecretDialog>,
    "result" | "saveAction" | "autoCopy"
  >,
  language?: i18n,
) {
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const dialog = (
    <OneTimeSecretDialog
      {...props}
      isOpen={true}
      onClose={() => {
        // Allow the dialog event to finish before disposing its final secret owner.
        queueMicrotask(() => {
          root.unmount()
          host.remove()
        })
      }}
    />
  )
  root.render(
    language ? (
      <I18nextProvider i18n={language}>{dialog}</I18nextProvider>
    ) : (
      dialog
    ),
  )
}
