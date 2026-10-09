import { UpdateLogDialog } from "~/features/UpdateLog/components/UpdateLogDialog"
import { useUpdateLogDialogContext } from "~/features/UpdateLog/context/UpdateLogDialogContext"

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
