import { DuplicateChannelWarningDialog } from "~/features/ManagedSiteChannels/editor/ChannelDialog/components/DuplicateChannelWarningDialog"
import { useChannelDialogContext } from "~/features/ManagedSiteChannels/editor/ChannelDialog/context/ChannelDialogContext"

/**
 * Global DuplicateChannelWarningDialog container that can be triggered from anywhere
 * through `useChannelDialog` helpers.
 */
export function DuplicateChannelWarningDialogContainer() {
  const { duplicateChannelWarning, resolveDuplicateChannelWarning } =
    useChannelDialogContext()

  return (
    <DuplicateChannelWarningDialog
      isOpen={duplicateChannelWarning.isOpen}
      existingChannelName={duplicateChannelWarning.existingChannelName}
      onCancel={() => resolveDuplicateChannelWarning(false)}
      onContinue={() => resolveDuplicateChannelWarning(true)}
    />
  )
}
