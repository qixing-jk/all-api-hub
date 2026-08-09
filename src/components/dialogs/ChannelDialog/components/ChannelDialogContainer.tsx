import { useChannelDialogContext } from "~/components/dialogs/ChannelDialog/context/ChannelDialogContext"
import { ManagedResourceCreateDialog } from "~/features/ManagedSiteChannels/components/ManagedResourceCreateDialog"
import AddTokenDialog from "~/features/TokenProvisioning/components/AddTokenDialog"
import { buildDefaultTokenCreatePrefill } from "~/features/TokenProvisioning/components/AddTokenDialog/defaultTokenCreatePrefill"

import { ChannelDialog } from "./ChannelDialog"

/**
 * Global ChannelDialog container that can be triggered from anywhere
 */
export function ChannelDialogContainer() {
  const {
    state,
    defaultTokenQuickCreateDialog,
    closeDialog,
    closeDefaultTokenQuickCreateDialog,
    handleSuccess,
    handleDefaultTokenQuickCreateSuccess,
  } = useChannelDialogContext()

  const defaultTokenQuickCreatePrefill = defaultTokenQuickCreateDialog.account
    ? buildDefaultTokenCreatePrefill(
        defaultTokenQuickCreateDialog.allowedGroups,
      )
    : undefined

  return (
    <>
      <ChannelDialog
        isOpen={state.isOpen && !state.nativeCreate}
        onClose={closeDialog}
        mode={state.mode}
        channel={state.channel ?? null}
        initialValues={state.initialValues}
        initialModels={state.initialModels}
        initialGroups={state.initialGroups}
        showModelPrefillWarning={state.showModelPrefillWarning}
        advisoryWarning={state.advisoryWarning}
        onRequestRealKey={state.onRequestRealKey ?? undefined}
        onSuccess={handleSuccess}
        onMutationOutcome={state.onMutationOutcome ?? undefined}
        resourceEdit={state.resourceEdit ?? null}
      />
      {state.nativeCreate ? (
        <ManagedResourceCreateDialog
          isOpen={state.isOpen}
          siteType={state.nativeCreate.siteType}
          kind={state.nativeCreate.kind}
          editor={state.nativeCreate.editor}
          showModelPrefillWarning={state.nativeCreate.showModelPrefillWarning}
          advisoryWarning={state.nativeCreate.advisoryWarning}
          onClose={closeDialog}
          onSuccess={handleSuccess}
        />
      ) : null}
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
