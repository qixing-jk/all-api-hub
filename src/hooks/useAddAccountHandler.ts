import type { MouseEvent } from "react"

import { showFirefoxWarningDialog } from "~/entrypoints/popup/components/FirefoxAddAccountWarningDialog/showFirefoxWarningDialog"
import { useDialogStateContext } from "~/features/AccountManagement/hooks/DialogStateContext"
import {
  isSponsorAddAccountPrefill,
  setPendingSponsorAddAccountPrefill,
} from "~/features/AccountManagement/sponsors/pendingAddAccountIntent"
import type { AddAccountPrefill } from "~/features/AccountManagement/sponsors/types"
import {
  isDesktopDevice,
  isExtensionSidePanel,
  isFirefox,
} from "~/utils/browser"
import { openSidePanelPage } from "~/utils/navigation"

/**
 * Hook that returns a click handler for launching the Add Account dialog.
 * It displays a dedicated warning flow only for Firefox desktop users outside
 * the side panel, while touch/mobile-like runtimes continue straight to the dialog.
 */
export function useAddAccountHandler() {
  const { openAddAccount } = useDialogStateContext()

  const handleAddAccountClick = (
    prefillOrEvent?: AddAccountPrefill | MouseEvent | null,
  ) => {
    const prefill =
      prefillOrEvent && isSponsorAddAccountPrefill(prefillOrEvent)
        ? prefillOrEvent
        : null

    // Firefox desktop installs require an additional warning because Firefox will close the popup when opening a new window.
    if (isFirefox() && isDesktopDevice() && !isExtensionSidePanel()) {
      showFirefoxWarningDialog(async () => {
        if (prefill) {
          await setPendingSponsorAddAccountPrefill(prefill)
        }
        await openSidePanelPage()
      })
    } else {
      openAddAccount(prefill)
    }
  }

  return { handleAddAccountClick }
}
