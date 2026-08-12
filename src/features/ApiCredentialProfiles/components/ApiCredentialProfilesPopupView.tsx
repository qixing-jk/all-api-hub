import { forwardRef, useImperativeHandle } from "react"

import { API_CREDENTIAL_PROFILES_VIEW_VARIANTS } from "../contracts"
import { useApiCredentialProfilesController } from "../hooks/useApiCredentialProfilesController"
import { API_CREDENTIAL_PROFILES_TEST_IDS } from "../testIds"
import { ApiCredentialProfilesListView } from "./ApiCredentialProfilesListView"

export type ApiCredentialProfilesPopupViewHandle = {
  openAddDialog: () => void
}

/**
 * Popup-optimized API credential profiles view.
 * Mounted only when the API Credentials tab is active.
 */
const ApiCredentialProfilesPopupView = forwardRef<
  ApiCredentialProfilesPopupViewHandle,
  Record<never, never>
>((_, ref) => {
  const controller = useApiCredentialProfilesController()

  useImperativeHandle(
    ref,
    () => ({
      openAddDialog: controller.openAddDialog,
    }),
    [controller.openAddDialog],
  )

  return (
    <div
      className="space-y-4 p-3 sm:p-4"
      data-testid={API_CREDENTIAL_PROFILES_TEST_IDS.popupView}
    >
      <ApiCredentialProfilesListView
        controller={controller}
        variant={API_CREDENTIAL_PROFILES_VIEW_VARIANTS.Popup}
        autoFocusSearch={true}
      />
    </div>
  )
})

ApiCredentialProfilesPopupView.displayName = "ApiCredentialProfilesPopupView"

export default ApiCredentialProfilesPopupView
