import { RuntimeActionIds } from "~/constants/runtimeActions"
import { sendRuntimeActionMessage } from "~/utils/browser/browserApi"

/** Clear through the background owner so queued logs cannot restore old history. */
export async function clearLogHistoryFromBackground(): Promise<void> {
  const response = await sendRuntimeActionMessage<{ success: boolean }>({
    action: RuntimeActionIds.LogHistoryClear,
  })
  if (!response?.success) throw new Error("Could not clear log history")
}
