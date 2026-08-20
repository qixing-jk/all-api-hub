import { SITE_TYPES } from "~/constants/siteType"
import { userPreferences } from "~/services/preferences/userPreferences"
import {
  PROTECTION_BYPASS_EXECUTION_KINDS,
  PROTECTION_BYPASS_USER_COMMANDS,
  type TEMP_CONTEXT_TASK_KINDS,
  type ResolvedProtectionBypassExecution,
  type TempContextTask,
} from "~/services/protectionBypass/contracts"
import { OCTOPUS_API_RESOURCE_BINDINGS } from "~/types/tempWindowFetch"

import { resolveCurrentManagedSiteRuntimeConfig } from "../runtimeConfig"

type OctopusApiFetchTask = Extract<
  TempContextTask,
  { kind: typeof TEMP_CONTEXT_TASK_KINDS.OctopusApiFetch }
>

/** Confirms an Octopus request still targets an allowed managed-site resource. */
export async function validateOctopusApiFetchResource(
  task: OctopusApiFetchTask,
  execution: ResolvedProtectionBypassExecution,
): Promise<boolean> {
  if (
    task.params.resourceBinding ===
      OCTOPUS_API_RESOURCE_BINDINGS.ConfigurationTest &&
    execution.kind === PROTECTION_BYPASS_EXECUTION_KINDS.UserCommand &&
    execution.command === PROTECTION_BYPASS_USER_COMMANDS.ManageSiteChannels
  ) {
    return true
  }

  try {
    const preferences = await userPreferences.getPreferencesStrict()
    const runtimeConfig = resolveCurrentManagedSiteRuntimeConfig(preferences)
    return Boolean(
      runtimeConfig?.siteType === SITE_TYPES.OCTOPUS &&
        new URL(runtimeConfig.config.baseUrl).origin ===
          new URL(task.params.originUrl).origin &&
        runtimeConfig.config.username.trim() === task.params.resourceUsername,
    )
  } catch {
    return false
  }
}
