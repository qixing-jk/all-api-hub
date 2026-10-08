import { forwardRef, useImperativeHandle } from "react"

import { API_CREDENTIAL_PROFILES_VIEW_VARIANTS } from "~/features/ApiCredentialProfiles/contracts"
import { ApiCredentialProfilesListView } from "~/features/ApiCredentialProfiles/list/ApiCredentialProfilesListView"
import { API_CREDENTIAL_PROFILES_TEST_IDS } from "~/features/ApiCredentialProfiles/testIds"
import { useApiCredentialProfilesController } from "~/features/ApiCredentialProfiles/workspace/useApiCredentialProfilesController"

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
      className="space-y-density-4 py-density-3 sm:py-density-4 px-3 sm:px-4"
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
