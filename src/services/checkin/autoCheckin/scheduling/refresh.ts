import {
  CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_DETECTION_OUTCOMES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_UNKNOWN_REASON_CODES,
  CHECK_IN_STATUS_REFRESH_OUTCOMES,
} from "~/constants/checkIn"
import type { AccountSiteType } from "~/constants/siteType"
import { runAbortableTask } from "~/services/apiTransport/abortableTask"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { resolveSelectedCheckInMethod } from "~/services/checkin/autoCheckin/discovery/inspection"
import type { AutoCheckinMethodRegistry } from "~/services/checkin/autoCheckin/providers/registry"
import {
  mergeCompatibilityCheckInStatus,
  replaceCheckInMethodDetection,
  replaceCheckInMethodStatus,
} from "~/services/checkin/autoCheckin/state"
import type { SiteAccount } from "~/types"
import type {
  CheckInConfig,
  CheckInMethodId,
  CheckInStatusRefreshOutcome,
} from "~/types/checkIn"

/** Refreshes only the selected method without exposing legacy config fields. */
export async function refreshSelectedStatus(input: {
  config: CheckInConfig
  siteType: AccountSiteType
  account?: SiteAccount
  request?: ApiServiceRequest
  readStatus?: (methodId: CheckInMethodId) => Promise<boolean | undefined>
  registry?: AutoCheckinMethodRegistry
  timeoutMs?: number
  observedAt?: number
  onOutcome?: (outcome: CheckInStatusRefreshOutcome) => void
}): Promise<CheckInConfig> {
  const methodId = resolveSelectedCheckInMethod({
    ...input,
    siteUrl: input.account?.site_url ?? input.request?.baseUrl,
  })
  if (!methodId) {
    input.onOutcome?.(CHECK_IN_STATUS_REFRESH_OUTCOMES.NoSelection)
    return input.config
  }

  const observedAt = input.observedAt ?? Date.now()
  const failedStatus = () =>
    replaceCheckInMethodStatus({
      config: input.config,
      methodId,
      status: {
        outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Unknown,
        reason: CHECK_IN_METHOD_UNKNOWN_REASON_CODES.SourceUnavailable,
        attemptedAt: observedAt,
      },
    })
  let isCheckedInToday: boolean | undefined
  if (input.readStatus) {
    try {
      isCheckedInToday = await runAbortableTask(
        () => input.readStatus!(methodId),
        { timeoutMs: input.timeoutMs, signals: [input.request?.abortSignal] },
      )
    } catch {
      input.onOutcome?.(CHECK_IN_STATUS_REFRESH_OUTCOMES.Unavailable)
      return failedStatus()
    }
  } else if (input.account || input.request) {
    // Load executable providers only when the selected method needs a query.
    // Discovery-only callers do not need the executable provider graph.
    const registry =
      input.registry ??
      (await import("~/services/checkin/autoCheckin/providers"))
        .autoCheckinMethodRegistry
    const registration = registry.resolveById(methodId)
    if (!registration?.provider.getStatus) {
      input.onOutcome?.(CHECK_IN_STATUS_REFRESH_OUTCOMES.Unsupported)
      return input.config
    }
    try {
      const status = await runAbortableTask(
        (signal) =>
          registration.provider.getStatus!({
            account: input.account,
            request: input.request
              ? { ...input.request, abortSignal: signal }
              : undefined,
            observedAt,
          }),
        { timeoutMs: input.timeoutMs, signals: [input.request?.abortSignal] },
      )
      input.onOutcome?.(
        status?.outcome === CHECK_IN_METHOD_STATUS_OUTCOMES.Known
          ? CHECK_IN_STATUS_REFRESH_OUTCOMES.Read
          : CHECK_IN_STATUS_REFRESH_OUTCOMES.Unavailable,
      )
      return status
        ? replaceCheckInMethodStatus({
            config: input.config,
            methodId,
            status,
          })
        : failedStatus()
    } catch (error) {
      const statusCode = getHttpStatusCode(error)
      const unsupported = statusCode === 404 || statusCode === 405
      input.onOutcome?.(
        unsupported
          ? CHECK_IN_STATUS_REFRESH_OUTCOMES.Unsupported
          : CHECK_IN_STATUS_REFRESH_OUTCOMES.Unavailable,
      )
      return unsupported
        ? replaceCheckInMethodDetection({
            config: input.config,
            methodId,
            detection: {
              outcome: CHECK_IN_METHOD_DETECTION_OUTCOMES.Unsupported,
              evidence: {
                source: CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES.Probe,
                observedAt,
              },
            },
          })
        : failedStatus()
    }
  }
  if (typeof isCheckedInToday !== "boolean") {
    input.onOutcome?.(CHECK_IN_STATUS_REFRESH_OUTCOMES.Unavailable)
    return failedStatus()
  }

  input.onOutcome?.(CHECK_IN_STATUS_REFRESH_OUTCOMES.Read)

  return mergeCompatibilityCheckInStatus({
    config: input.config,
    methodId,
    isCheckedInToday,
    observedAt,
  })
}

const getHttpStatusCode = (error: unknown): number | undefined =>
  error && typeof error === "object" && "statusCode" in error
    ? typeof error.statusCode === "number"
      ? error.statusCode
      : undefined
    : undefined
