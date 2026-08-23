import React, { Suspense } from "react"
import ReactDOM from "react-dom/client"

import { RootErrorBoundary } from "~/components/RootErrorBoundary"
import { i18nReady } from "~/utils/i18n"
import { t } from "~/utils/i18n/core"
import { setDocumentTitle } from "~/utils/navigation/documentTitle"

import App from "./App"

/** Render only after the active and fallback locale assets are ready. */
async function renderApp() {
  await i18nReady
  setDocumentTitle("sidepanel")

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <RootErrorBoundary>
        <Suspense fallback={<div>{t("common:status.loading")}</div>}>
          <App />
        </Suspense>
      </RootErrorBoundary>
    </React.StrictMode>,
  )
}

void renderApp()
