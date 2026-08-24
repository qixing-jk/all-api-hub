import type { ReactNode } from "react"
import React, { Suspense } from "react"
import ReactDOM from "react-dom/client"

import { RootErrorBoundary } from "~/components/RootErrorBoundary"
import { i18nReady } from "~/utils/i18n"
import { t } from "~/utils/i18n/core"
import { setDocumentTitle } from "~/utils/navigation/documentTitle"

type ExtensionPageType = Parameters<typeof setDocumentTitle>[0]

/** Mount a page only after its active and fallback locale assets are ready. */
export async function renderExtensionPage(
  pageType: ExtensionPageType,
  app: ReactNode,
) {
  await i18nReady
  setDocumentTitle(pageType)

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <RootErrorBoundary>
        <Suspense fallback={<div>{t("common:status.loading")}</div>}>
          {app}
        </Suspense>
      </RootErrorBoundary>
    </React.StrictMode>,
  )
}
