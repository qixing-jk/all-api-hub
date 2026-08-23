import React, { Suspense } from "react"
import ReactDOM from "react-dom/client"

import { RootErrorBoundary } from "~/components/RootErrorBoundary"
import { UI_CONSTANTS } from "~/constants/ui"
import { isMobileDevice } from "~/utils/browser"
import { i18nReady } from "~/utils/i18n"
import { t } from "~/utils/i18n/core"
import { setDocumentTitle } from "~/utils/navigation/documentTitle"

import App from "./App"

import "./style.css"

if (!isMobileDevice()) {
  const popupDocument = document.documentElement
  const { HEIGHT_PX, WIDTH_PX } = UI_CONSTANTS.POPUP
  const syncPopupDocumentSize = () => {
    // Ignore the transient tiny viewport Edge exposes before it measures the
    // seeded popup content. The following resize will carry the usable size.
    if (window.innerWidth >= 200) {
      popupDocument.style.setProperty(
        "--extension-popup-width",
        `${Math.min(WIDTH_PX, window.innerWidth)}px`,
      )
    }
    if (window.innerHeight >= 200) {
      popupDocument.style.setProperty(
        "--extension-popup-height",
        `${Math.min(HEIGHT_PX, window.innerHeight)}px`,
      )
    }
  }

  popupDocument.classList.add("desktop-extension-popup")
  popupDocument.style.setProperty("--extension-popup-width", `${WIDTH_PX}px`)
  popupDocument.style.setProperty("--extension-popup-height", `${HEIGHT_PX}px`)
  requestAnimationFrame(syncPopupDocumentSize)
  window.addEventListener("resize", syncPopupDocumentSize)
}

/** Render only after the active and fallback locale assets are ready. */
async function renderApp() {
  await i18nReady
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
}

void renderApp()
