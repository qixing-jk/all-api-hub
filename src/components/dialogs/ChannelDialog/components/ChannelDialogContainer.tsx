import { useChannelDialogContext } from "~/components/dialogs/ChannelDialog/context/ChannelDialogContext"
import AddTokenDialog from "~/features/KeyManagement/components/AddTokenDialog"
import { DEFAULT_AUTO_PROVISION_TOKEN_NAME } from "~/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken"

import { ChannelDialog } from "./ChannelDialog"

/**
 * Global ChannelDialog container that can be triggered from anywhere
 */
export function ChannelDialogContainer() {
  const {
    state,
    sub2apiTokenDialog,
    closeDialog,
    closeSub2ApiTokenDialog,
    handleSuccess,
    handleSub2ApiTokenSuccess,
  } = useChannelDialogContext()

  const sub2apiTokenDialogPrefill =
    sub2apiTokenDialog.account && sub2apiTokenDialog.allowedGroups.length > 0
      ? {
          modelId: "",
          defaultName: DEFAULT_AUTO_PROVISION_TOKEN_NAME,
          group: sub2apiTokenDialog.allowedGroups.includes("default")
            ? "default"
            : sub2apiTokenDialog.allowedGroups[0] ?? "default",
          allowedGroups: sub2apiTokenDialog.allowedGroups,
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
      />
      {sub2apiTokenDialog.account && sub2apiTokenDialogPrefill ? (
        <AddTokenDialog
          isOpen={sub2apiTokenDialog.isOpen}
          onClose={closeSub2ApiTokenDialog}
          availableAccounts={[sub2apiTokenDialog.account]}
          preSelectedAccountId={sub2apiTokenDialog.account.id}
          createPrefill={sub2apiTokenDialogPrefill}
          prefillNotice={sub2apiTokenDialog.notice}
          onSuccess={handleSub2ApiTokenSuccess}
        />
      ) : null}
    </>
  )
}
