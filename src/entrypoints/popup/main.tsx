import React, { Suspense } from "react"
import ReactDOM from "react-dom/client"

import "~/utils/i18n" // Import the i18n configuration

import { RootErrorBoundary } from "~/components/RootErrorBoundary"
import { t } from "~/utils/i18n/core"
import { setDocumentTitle } from "~/utils/navigation/documentTitle"

import App from "./App"

// Set the document title immediately
setDocumentTitle("popup")

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <Suspense fallback={<div>{t("common:status.loading")}</div>}>
        <App />
      </Suspense>
    </RootErrorBoundary>
  </React.StrictMode>,
)
