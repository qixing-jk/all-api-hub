import { UI_CONSTANTS } from "~/constants/ui"
import { renderExtensionPage } from "~/entrypoints/shared/renderExtensionPage"
import { isMobileDevice } from "~/utils/browser"

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

void renderExtensionPage("popup", <App />)
