import {
  PROTECTION_BYPASS_EXECUTION_KINDS,
  PROTECTION_BYPASS_EXECUTION_VERSION,
  PROTECTION_BYPASS_SURFACES,
  type ProtectionBypassSurface,
  type ProtectionBypassUserCommand,
} from "~/services/protectionBypass/contracts"

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
