import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { renderExtensionPage } from "~/entrypoints/shared/renderExtensionPage"

import App from "./App"

const queryClient = new QueryClient()

void renderExtensionPage(
  "options",
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>,
)
