import type { MouseEvent } from "react"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { showFirefoxWarningDialog } from "~/entrypoints/popup/components/FirefoxAddAccountWarningDialog/showFirefoxWarningDialog"
import { useDialogStateContext } from "~/features/AccountManagement/hooks/DialogStateContext"
import { ACCOUNT_MANAGEMENT_ROUTE_ACTIONS } from "~/features/AccountManagement/routeParams"
import {
  isSponsorAddAccountPrefill,
  setPendingSponsorAddAccountPrefill,
} from "~/features/AccountManagement/sponsors/pendingAddAccountIntent"
import type { AddAccountPrefill } from "~/features/AccountManagement/sponsors/types"
import { isDesktopDevice, isExtensionPopup, isFirefox } from "~/utils/browser"
import { getSidePanelSupport } from "~/utils/browser/browserApi"
import {
  closeIfPopup,
  openOrFocusOptionsMenuItem,
  openSidePanelWithFallback,
} from "~/utils/navigation"

/**
 * Hook that returns a click handler for launching the Add Account dialog.
 * It displays a dedicated warning flow only for Firefox desktop users in
 * a popup, while touch/mobile-like runtimes continue straight to the dialog.
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
    if (isFirefox() && isDesktopDevice() && isExtensionPopup()) {
      const sidePanelSupported = getSidePanelSupport().supported
      const openOptions = () =>
        openOrFocusOptionsMenuItem(MENU_ITEM_IDS.ACCOUNT, {
          action: ACCOUNT_MANAGEMENT_ROUTE_ACTIONS.Add,
        })
      showFirefoxWarningDialog(async () => {
        const stagePrefill = prefill
          ? setPendingSponsorAddAccountPrefill(prefill)
          : Promise.resolve()
        // Invoke native opening synchronously in the confirmation click turn.
        const destination = sidePanelSupported
          ? openSidePanelWithFallback(undefined, openOptions)
          : openOptions()
        await Promise.all([stagePrefill, destination])
        closeIfPopup()
      }, sidePanelSupported)
    } else {
      openAddAccount(prefill)
    }
  }

  return { handleAddAccountClick }
}
