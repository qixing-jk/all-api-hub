import React, { Suspense } from "react"
import ReactDOM from "react-dom/client"

import "~/utils/i18n" // Import the i18n configuration
import "./style.css"

import { setDocumentTitle } from "~/utils/documentTitle"

import App from "./App.tsx"

// Set the document title immediately
setDocumentTitle("popup")

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Suspense fallback={<div>Loading...</div>}>
      <App />
    </Suspense>
  </React.StrictMode>
)
