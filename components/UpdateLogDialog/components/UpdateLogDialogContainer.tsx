import { useUpdateLogDialogContext } from "~/components/UpdateLogDialog/context/UpdateLogDialogContext"

import { UpdateLogDialog } from "./UpdateLogDialog"

/**
 * Global UpdateLogDialog container that can be triggered from anywhere.
 */
export function UpdateLogDialogContainer() {
  const { state, closeDialog } = useUpdateLogDialogContext()

  if (!state.version) return null

  return (
    <UpdateLogDialog
      isOpen={state.isOpen}
      onClose={closeDialog}
      version={state.version}
    />
  )
}

export default UpdateLogDialogContainer
