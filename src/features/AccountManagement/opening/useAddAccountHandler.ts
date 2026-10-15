import { useCallback, type MouseEvent } from "react"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { useDialogStateContext } from "~/features/AccountManagement/dialogs/useDialogStateContext"
import { showFirefoxWarningDialog } from "~/features/AccountManagement/opening/FirefoxAddAccountWarningDialog/showFirefoxWarningDialog"
import { ACCOUNT_MANAGEMENT_ROUTE_ACTIONS } from "~/features/AccountManagement/routeParams"
import { isSponsorAddAccountPrefill } from "~/features/AccountManagement/sponsors/addAccountPrefill"
import { SPONSOR_WORKFLOW_KINDS } from "~/features/AccountManagement/sponsors/constants"
import { openSponsorWorkflow } from "~/features/AccountManagement/sponsors/openSponsorWorkflow"
import type { AddAccountPrefill } from "~/features/AccountManagement/sponsors/types"
import { isDesktopDevice, isExtensionPopup, isFirefox } from "~/utils/browser"
import { getSidePanelSupport } from "~/utils/browser/sidePanel"
import { openOrFocusOptionsMenuItem } from "~/utils/navigation/optionsPage"
import { closeIfPopup } from "~/utils/navigation/popup"
import { openSidePanelWithFallback } from "~/utils/navigation/sidepanel"

/**
 * Hook that returns a click handler for launching the Add Account dialog.
 * It displays a dedicated warning flow only for Firefox desktop users in
 * a popup, while touch/mobile-like runtimes continue straight to the dialog.
 */
export function useAddAccountHandler() {
  const { openAddAccount } = useDialogStateContext()

  const handleAddAccountClick = useCallback(
    (prefillOrEvent?: AddAccountPrefill | MouseEvent | null) => {
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
          if (prefill) {
            await openSponsorWorkflow(
              { kind: SPONSOR_WORKFLOW_KINDS.Account, prefill },
              () => {},
            )
            return
          }
          await openSidePanelWithFallback(undefined, openOptions)
          closeIfPopup()
        }, sidePanelSupported)
      } else {
        openAddAccount(prefill)
      }
    },
    [openAddAccount],
  )

  return { handleAddAccountClick }
}
