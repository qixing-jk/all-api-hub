import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React, { Suspense } from "react"
import ReactDOM from "react-dom/client"

import "~/src/utils/i18n"

import { setDocumentTitle } from "~/src/utils/navigation/documentTitle"

import App from "./App"

setDocumentTitle("options")

const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={<div>Loading...</div>}>
        <App />
      </Suspense>
    </QueryClientProvider>
  </React.StrictMode>,
)
