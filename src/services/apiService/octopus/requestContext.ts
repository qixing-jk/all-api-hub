import {
  OCTOPUS_AUTH_MODES,
  type OctopusAuthSession,
} from "~/services/apiService/octopus/auth"
import { buildOctopusAuthHeaders } from "~/services/apiService/octopus/utils"
import {
  createAutomaticProtectionBypassExecution,
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS,
  PROTECTION_BYPASS_FEATURES,
  type ProtectionBypassExecution,
} from "~/services/protectionBypass/contracts"
import { type OctopusApiResourceBinding } from "~/types/tempWindowFetch"
import { getCurrentTempWindowRequestSource } from "~/utils/browser/tempWindowRequestSource"

export type OctopusRequestInit = RequestInit & {
  protectionBypassExecution?: ProtectionBypassExecution
  resourceBinding?: OctopusApiResourceBinding
}

export const resolveOctopusProtectionExecution = (
  execution: ProtectionBypassExecution | undefined,
): ProtectionBypassExecution => {
  if (execution) return execution
  const requestSource = getCurrentTempWindowRequestSource()
  return createAutomaticProtectionBypassExecution(
    PROTECTION_BYPASS_FEATURES.ManagedSiteChannels,
    requestSource === "background"
      ? PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.BackgroundRecovery
      : PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.UiLifecycle,
    requestSource,
  )
}

export const throwIfOctopusRequestAborted = (signal?: AbortSignal) => {
  if (!signal?.aborted) return
  throw (
    signal.reason ?? new DOMException("The operation was aborted", "AbortError")
  )
}

export const createOctopusRequestHeaders = (
  session: OctopusAuthSession,
  headers?: HeadersInit,
): Headers => {
  const token =
    session.mode === OCTOPUS_AUTH_MODES.Bearer ? session.token : undefined
  const requestHeaders = new Headers(buildOctopusAuthHeaders(token))
  const overrideHeaders = new Headers(headers)
  for (const [name, value] of overrideHeaders.entries()) {
    requestHeaders.set(name, value)
  }
  return requestHeaders
}
