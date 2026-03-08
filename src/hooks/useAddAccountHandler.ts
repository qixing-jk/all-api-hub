import { showFirefoxWarningDialog } from "~/entrypoints/popup/components/FirefoxAddAccountWarningDialog/showFirefoxWarningDialog"
import { useDialogStateContext } from "~/features/AccountManagement/hooks/DialogStateContext"
import {
  isDesktopDevice,
  isExtensionSidePanel,
  isFirefox,
} from "~/utils/browser"

/**
 * Hook that returns a click handler for launching the Add Account dialog.
 * It displays a dedicated warning flow only for Firefox desktop users outside
 * the side panel, while touch/mobile-like runtimes continue straight to the dialog.
 */
export function useAddAccountHandler() {
  const { openAddAccount } = useDialogStateContext()

  const handleAddAccountClick = () => {
    // Firefox desktop installs require an additional warning because Firefox will close the popup when opening a new window.
    if (isFirefox() && isDesktopDevice() && !isExtensionSidePanel()) {
      showFirefoxWarningDialog()
    } else {
      openAddAccount()
    }
  }

  return { handleAddAccountClick }
}
