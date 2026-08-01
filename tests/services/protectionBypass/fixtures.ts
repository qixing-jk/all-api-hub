import {
  PROTECTION_BYPASS_EXECUTION_KINDS,
  PROTECTION_BYPASS_EXECUTION_VERSION,
  PROTECTION_BYPASS_SURFACES,
  type ProtectionBypassAutomaticFeature,
  type ProtectionBypassAutomaticTrigger,
  type ProtectionBypassSurface,
  type ProtectionBypassUserCommand,
} from "~/services/protectionBypass/contracts"

// Build protocol fixtures independently so constructor regressions remain observable.
export function userCommandExecution(
  command: ProtectionBypassUserCommand,
  surface: ProtectionBypassSurface = PROTECTION_BYPASS_SURFACES.Options,
) {
  return {
    version: PROTECTION_BYPASS_EXECUTION_VERSION,
    kind: PROTECTION_BYPASS_EXECUTION_KINDS.UserCommand,
    command,
    surface,
  } as const
}

export function automaticExecution(
  feature: ProtectionBypassAutomaticFeature,
  trigger: ProtectionBypassAutomaticTrigger,
  surface: ProtectionBypassSurface = PROTECTION_BYPASS_SURFACES.Background,
) {
  return {
    version: PROTECTION_BYPASS_EXECUTION_VERSION,
    kind: PROTECTION_BYPASS_EXECUTION_KINDS.Automatic,
    feature,
    trigger,
    surface,
  } as const
}
