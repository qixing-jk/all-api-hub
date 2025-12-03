import { createRoot } from "react-dom/client"

import { openSidePanelPage } from "~/utils/navigation"

import FirefoxAddAccountWarningDialog from "./index"

/**
 * Shows a Firefox-specific warning dialog that warns users about
 * the risks of adding an account in a non-side-panel context.
 *
 * @param {function} [onConfirm=openSidePanelPage] - Called when the user confirms
 * that they want to add an account in a non-side-panel context.
 */
export function showFirefoxWarningDialog(
  onConfirm: () => void = openSidePanelPage,
) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)

  const handleClose = () => {
    root.unmount()
    container.remove()
  }

  root.render(
    <FirefoxAddAccountWarningDialog
      isOpen={true}
      onClose={handleClose}
      onConfirm={() => {
        handleClose()
        onConfirm?.()
      }}
    />,
  )
}
