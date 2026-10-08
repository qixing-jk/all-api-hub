import { createAutomaticProtectionBypassExecution } from "~/services/protectionBypass/client"
import {
  isProtectionBypassExecution,
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS,
  PROTECTION_BYPASS_EXECUTION_KINDS,
  PROTECTION_BYPASS_FEATURES,
  type ProtectionBypassExecution,
  type ProtectionBypassUserCommand,
} from "~/services/protectionBypass/contracts"
import { type TempWindowRequestSource } from "~/types/tempWindowFetch"

export const createAutomaticCheckinExecution = (
  trigger: (typeof PROTECTION_BYPASS_AUTOMATIC_TRIGGERS)[keyof typeof PROTECTION_BYPASS_AUTOMATIC_TRIGGERS],
  surface: TempWindowRequestSource,
) =>
  createAutomaticProtectionBypassExecution(
    PROTECTION_BYPASS_FEATURES.Checkin,
    trigger,
    surface,
  )

export const isExpectedCheckinCommandExecution = (
  execution: unknown,
  expectedCommand: ProtectionBypassUserCommand,
): execution is Extract<
  ProtectionBypassExecution,
  { kind: typeof PROTECTION_BYPASS_EXECUTION_KINDS.UserCommand }
> =>
  isProtectionBypassExecution(execution) &&
  execution.kind === PROTECTION_BYPASS_EXECUTION_KINDS.UserCommand &&
  execution.command === expectedCommand

export const isUiOpenCheckinExecution = (
  execution: unknown,
  surface: TempWindowRequestSource,
): execution is ProtectionBypassExecution =>
  isProtectionBypassExecution(execution) &&
  execution.kind === PROTECTION_BYPASS_EXECUTION_KINDS.Automatic &&
  execution.feature === PROTECTION_BYPASS_FEATURES.Checkin &&
  execution.trigger === PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.UiLifecycle &&
  execution.surface === surface
