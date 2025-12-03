import { useChannelDialogContext } from "~/components/ChannelDialog/context/ChannelDialogContext"

import { ChannelDialog } from "./ChannelDialog"

/**
 * Global ChannelDialog container that can be triggered from anywhere
 */
export function ChannelDialogContainer() {
  const { state, closeDialog, handleSuccess } = useChannelDialogContext()

  return (
    <ChannelDialog
      isOpen={state.isOpen}
      onClose={closeDialog}
      mode={state.mode}
      channel={state.channel ?? null}
      initialValues={state.initialValues}
      initialModels={state.initialModels}
      initialGroups={state.initialGroups}
      onSuccess={handleSuccess}
    />
  )
}
