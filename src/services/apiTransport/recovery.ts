import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"

import type {
  ApiDirectRequestReason,
  ApiTransportRecovery,
  ApiTransportRequestFields,
} from "./type"

/** Bind invocation intent once; the explicit direct reason covers passive/caller-owned work. */
function resolveApiTransportRecovery(
  execution: ProtectionBypassExecution | undefined,
  directReason: ApiDirectRequestReason,
): ApiTransportRecovery {
  return execution
    ? { protectionBypassExecution: execution, directRequestReason: undefined }
    : {
        protectionBypassExecution: undefined,
        directRequestReason: directReason,
      }
}

/** Account/command request factories bind the recovery choice before handing work to adapters. */
export function bindApiTransportRequest<
  T extends ApiTransportRequestFields & {
    protectionBypassExecution?: ProtectionBypassExecution
  },
>(
  request: T,
  directReason: ApiDirectRequestReason,
): Omit<T, "protectionBypassExecution" | "directRequestReason"> &
  ApiTransportRecovery {
  return {
    ...request,
    ...resolveApiTransportRecovery(
      request.protectionBypassExecution,
      directReason,
    ),
  }
}
