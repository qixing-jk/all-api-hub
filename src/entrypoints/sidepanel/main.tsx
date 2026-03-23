import React, { Suspense } from "react"
import ReactDOM from "react-dom/client"

import "~/utils/i18n" // Import the i18n configuration

import { t } from "~/utils/i18n/core"
import { setDocumentTitle } from "~/utils/navigation/documentTitle"

import App from "./App"

// Set the document title immediately
setDocumentTitle("sidepanel")

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Suspense fallback={<div>{t("common:status.loading")}</div>}>
      <App />
    </Suspense>
  </React.StrictMode>,
)
