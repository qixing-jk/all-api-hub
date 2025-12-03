import { showFirefoxWarningDialog } from "~/entrypoints/popup/components/FirefoxAddAccountWarningDialog/showFirefoxWarningDialog"
import { useDialogStateContext } from "~/features/AccountManagement/hooks/DialogStateContext"
import { isDesktopByUA, isExtensionSidePanel, isFirefox } from "~/utils/browser"

export function useAddAccountHandler() {
  const { openAddAccount } = useDialogStateContext()

  const handleAddAccountClick = () => {
    if (isFirefox() && isDesktopByUA() && !isExtensionSidePanel()) {
      showFirefoxWarningDialog()
    } else {
      openAddAccount()
    }
  }

  return { handleAddAccountClick }
}
