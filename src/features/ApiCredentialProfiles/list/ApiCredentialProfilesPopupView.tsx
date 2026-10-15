import { forwardRef, useEffect, useImperativeHandle } from "react"

import type { SponsorApiCredentialFallbackPrefill } from "~/features/AccountManagement/sponsors/types"
import { API_CREDENTIAL_PROFILES_VIEW_VARIANTS } from "~/features/ApiCredentialProfiles/contracts"
import { ApiCredentialProfilesListView } from "~/features/ApiCredentialProfiles/list/ApiCredentialProfilesListView"
import { API_CREDENTIAL_PROFILES_TEST_IDS } from "~/features/ApiCredentialProfiles/testIds"
import { useApiCredentialProfilesController } from "~/features/ApiCredentialProfiles/workspace/useApiCredentialProfilesController"

export type ApiCredentialProfilesPopupViewHandle = {
  openAddDialog: (prefill?: SponsorApiCredentialFallbackPrefill) => void
}

/**
 * Popup-optimized API credential profiles view.
 * Mounted only when the API Credentials tab is active.
 */
const ApiCredentialProfilesPopupView = forwardRef<
  ApiCredentialProfilesPopupViewHandle,
  {
    showKeyManagementImportHint?: boolean
    onHasProfilesChange?: (hasProfiles: boolean) => void
  }
>(({ showKeyManagementImportHint = true, onHasProfilesChange }, ref) => {
  const controller = useApiCredentialProfilesController()
  const hasProfiles = controller.profiles.length > 0

  useEffect(() => {
    onHasProfilesChange?.(hasProfiles)
  }, [hasProfiles, onHasProfilesChange])

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
        showKeyManagementImportHint={showKeyManagementImportHint}
      />
    </div>
  )
})

ApiCredentialProfilesPopupView.displayName = "ApiCredentialProfilesPopupView"

export default ApiCredentialProfilesPopupView
