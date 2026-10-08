import { createRoot } from "react-dom/client"

import FirefoxAddAccountWarningDialog from "~/features/AccountManagement/opening/FirefoxAddAccountWarningDialog"
import { getSidePanelSupport } from "~/utils/browser/sidePanel"
import { openSidePanelPage } from "~/utils/navigation/sidepanel"

/**
 * Shows a Firefox-specific warning dialog that warns users about
 * the risks of adding an account in a non-side-panel context.
 * @param [onConfirm] - Called when the user confirms
 * that they want to add an account in a non-side-panel context.
 */
export function showFirefoxWarningDialog(
  onConfirm: () => void | Promise<unknown> = openSidePanelPage,
  sidePanelSupported = getSidePanelSupport().supported,
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
      sidePanelSupported={sidePanelSupported}
      onConfirm={async () => {
        await onConfirm()
        handleClose()
      }}
    />,
  )
}
