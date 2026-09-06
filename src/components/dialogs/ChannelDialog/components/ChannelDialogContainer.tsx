import { useChannelDialogContext } from "~/components/dialogs/ChannelDialog/context/ChannelDialogContext"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { ManagedResourceCreateDialog } from "~/features/ManagedSiteChannels/components/ManagedResourceCreateDialog"
import { useManagedResourceInteraction } from "~/features/ManagedSiteChannels/providers/useManagedResourceInteraction"
import AddTokenDialog from "~/features/TokenProvisioning/components/AddTokenDialog"
import { buildDefaultTokenCreatePrefill } from "~/features/TokenProvisioning/components/AddTokenDialog/defaultTokenCreatePrefill"

/**
 * Global ChannelDialog container that can be triggered from anywhere
 */
export function ChannelDialogContainer() {
  const { preferences, managedSiteType } = useUserPreferencesContext()
  const {
    state,
    defaultTokenQuickCreateDialog,
    closeDialog,
    completeNativeDialogClose,
    closeDefaultTokenQuickCreateDialog,
    handleSuccess,
    handleDefaultTokenQuickCreateSuccess,
  } = useChannelDialogContext()

  const defaultTokenQuickCreatePrefill = defaultTokenQuickCreateDialog.account
    ? buildDefaultTokenCreatePrefill(
        defaultTokenQuickCreateDialog.allowedGroups,
      )
    : undefined
  const nativeCreate = state.nativeCreate
  const { runRead, verificationDialog } = useManagedResourceInteraction({
    siteType: nativeCreate?.siteType ?? managedSiteType,
    newApiConfig: preferences.newApi,
  })

  return (
    <>
      {nativeCreate ? (
        <ManagedResourceCreateDialog
          key={nativeCreate.sessionId}
          isOpen={state.isOpen}
          siteType={nativeCreate.siteType}
          kind={nativeCreate.kind}
          editor={nativeCreate.editor}
          showModelPrefillWarning={nativeCreate.showModelPrefillWarning}
          advisoryWarning={nativeCreate.advisoryWarning}
          runRead={runRead}
          onClose={closeDialog}
          onCloseComplete={() =>
            completeNativeDialogClose(nativeCreate.sessionId)
          }
          onSuccess={handleSuccess}
        />
      ) : null}
      {verificationDialog}
      {defaultTokenQuickCreateDialog.account &&
      defaultTokenQuickCreatePrefill ? (
        <AddTokenDialog
          isOpen={defaultTokenQuickCreateDialog.isOpen}
          onClose={closeDefaultTokenQuickCreateDialog}
          availableAccounts={[defaultTokenQuickCreateDialog.account]}
          preSelectedAccountId={defaultTokenQuickCreateDialog.account.id}
          createPrefill={defaultTokenQuickCreatePrefill}
          prefillNotice={defaultTokenQuickCreateDialog.notice}
          onSuccess={handleDefaultTokenQuickCreateSuccess}
        />
      ) : null}
    </>
  )
}
