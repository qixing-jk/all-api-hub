import { useChannelDialogContext } from "~/components/ChannelDialog/context/ChannelDialogContext"

import { DuplicateChannelWarningDialog } from "./DuplicateChannelWarningDialog"

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

export default DuplicateChannelWarningDialogContainer
