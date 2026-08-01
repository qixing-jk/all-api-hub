import {
  createAutomaticProtectionBypassExecution,
  PROTECTION_BYPASS_EXECUTION_KINDS,
  PROTECTION_BYPASS_EXECUTION_VERSION,
  type ProtectionBypassExecution,
  type ProtectionBypassSurface,
  type ProtectionBypassUserCommand,
} from "./contracts"

export { createAutomaticProtectionBypassExecution }

type UserCommandProtectionBypassExecution = Extract<
  ProtectionBypassExecution,
  { kind: typeof PROTECTION_BYPASS_EXECUTION_KINDS.UserCommand }
>

/** Builds immutable user-command intent without runtime state or IO. */
export function createUserCommandProtectionBypassExecution(
  command: ProtectionBypassUserCommand,
  surface: ProtectionBypassSurface,
): UserCommandProtectionBypassExecution {
  return Object.freeze({
    version: PROTECTION_BYPASS_EXECUTION_VERSION,
    kind: PROTECTION_BYPASS_EXECUTION_KINDS.UserCommand,
    command,
    surface,
  })
}

/** Runs caller work with plain user-command intent. */
export async function withProtectionBypassUserCommand<T>(
  command: ProtectionBypassUserCommand,
  surface: ProtectionBypassSurface,
  work: (execution: ProtectionBypassExecution) => Promise<T>,
): Promise<T> {
  return await work(
    createUserCommandProtectionBypassExecution(command, surface),
  )
}
