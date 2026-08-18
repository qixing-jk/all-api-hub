import { validateNewApiSessionReadResource } from "~/services/managedSites/providers/newApiProtectionBypassResource"
import { validateOctopusApiFetchResource } from "~/services/managedSites/providers/octopusProtectionBypassResource"
import {
  TEMP_CONTEXT_TASK_KINDS,
  type ResolvedProtectionBypassExecution,
  type TempContextTask,
} from "~/services/protectionBypass/contracts"

export type ValidateProtectionBypassTaskResource = (
  task: TempContextTask,
  execution: ResolvedProtectionBypassExecution,
) => Promise<boolean>

/** Delegates resource freshness to the adapter that owns each protected task. */
export const validateProtectionBypassTaskResource: ValidateProtectionBypassTaskResource =
  async (task, execution) => {
    switch (task.kind) {
      case TEMP_CONTEXT_TASK_KINDS.NewApiSessionRead:
        return await validateNewApiSessionReadResource({
          origin: task.params.origin,
          userId: task.params.userId,
          channelId: task.params.channelId,
        })
      case TEMP_CONTEXT_TASK_KINDS.OctopusApiFetch:
        return await validateOctopusApiFetchResource(task, execution)
      case TEMP_CONTEXT_TASK_KINDS.ApiFallbackFetch:
      case TEMP_CONTEXT_TASK_KINDS.ProfileIsolatedFetch:
      case TEMP_CONTEXT_TASK_KINDS.TurnstileFetch:
      case TEMP_CONTEXT_TASK_KINDS.NativePageAction:
      case TEMP_CONTEXT_TASK_KINDS.OpenRouterManagementKeyAction:
      case TEMP_CONTEXT_TASK_KINDS.RenderedTitle:
      case TEMP_CONTEXT_TASK_KINDS.SessionRead:
      case TEMP_CONTEXT_TASK_KINDS.OpenContext:
        return true
      default: {
        const unsupportedTask: never = task
        void unsupportedTask
        return false
      }
    }
  }
