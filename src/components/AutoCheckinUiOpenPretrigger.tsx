import { AutoCheckinPretriggerCompletionDialog } from "~/components/AutoCheckinPretriggerCompletionDialog"
import { useAutoCheckinUiOpenPretrigger } from "~/hooks/useAutoCheckinUiOpenPretrigger"

/**
 * Global UI helper that pre-triggers today's scheduled daily auto check-in when
 * a UI surface opens, then shows a completion summary dialog.
 */
export function AutoCheckinUiOpenPretrigger() {
  const { dialog, setDialogOpen } = useAutoCheckinUiOpenPretrigger()

  return (
    <AutoCheckinPretriggerCompletionDialog
      isOpen={dialog.isOpen}
      summary={dialog.summary}
      pendingRetry={dialog.pendingRetry}
      onClose={() => setDialogOpen(false)}
    />
  )
}

export default AutoCheckinUiOpenPretrigger
