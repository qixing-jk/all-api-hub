import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React, { Suspense } from "react"
import ReactDOM from "react-dom/client"

import { RootErrorBoundary } from "~/components/RootErrorBoundary"
import { i18nReady } from "~/utils/i18n"
import { t } from "~/utils/i18n/core"
import { setDocumentTitle } from "~/utils/navigation/documentTitle"

import App from "./App"

const queryClient = new QueryClient()

/** Render only after the active and fallback locale assets are ready. */
async function renderApp() {
  await i18nReady
  setDocumentTitle("options")

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <RootErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <Suspense fallback={<div>{t("common:status.loading")}</div>}>
            <App />
          </Suspense>
        </QueryClientProvider>
      </RootErrorBoundary>
    </React.StrictMode>,
  )
}

void renderApp()
