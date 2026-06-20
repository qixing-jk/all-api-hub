import { useChannelDialogContext } from "~/components/dialogs/ChannelDialog/context/ChannelDialogContext"
import AddTokenDialog from "~/features/KeyManagement/components/AddTokenDialog"
import {
  DEFAULT_AUTO_PROVISION_TOKEN_NAME,
  resolvePreferredDefaultUserGroup,
} from "~/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken"

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

  const defaultTokenQuickCreatePrefill =
    defaultTokenQuickCreateDialog.account &&
    defaultTokenQuickCreateDialog.allowedGroups.length > 0
      ? {
          modelId: "",
          defaultName: DEFAULT_AUTO_PROVISION_TOKEN_NAME,
          group: resolvePreferredDefaultUserGroup(
            defaultTokenQuickCreateDialog.allowedGroups,
          ),
          allowedGroups: defaultTokenQuickCreateDialog.allowedGroups,
        }
      : undefined

  return (
    <>
      <ChannelDialog
        isOpen={state.isOpen}
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
      />
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
