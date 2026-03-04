import { showFirefoxWarningDialog } from "~/entrypoints/popup/components/FirefoxAddAccountWarningDialog/showFirefoxWarningDialog"
import { useDialogStateContext } from "~/features/AccountManagement/hooks/DialogStateContext"
import { isDesktopByUA, isExtensionSidePanel, isFirefox } from "~/utils/browser"

/**
 * Hook that returns a click handler for launching the Add Account dialog.
 * It displays a dedicated warning flow for Firefox desktop users outside the side panel.
 */
export function useAddAccountHandler() {
  const { openAddAccount } = useDialogStateContext()

  const handleAddAccountClick = () => {
    // Firefox desktop installs require an additional warning because Firefox will close the popup when opening a new window.
    if (isFirefox() && isDesktopByUA() && !isExtensionSidePanel()) {
      showFirefoxWarningDialog()
    } else {
      openAddAccount()
    }
  }

  return { handleAddAccountClick }
}
