import {
  CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_DETECTION_OUTCOMES,
} from "~/constants/checkIn"
import type { AccountSiteType } from "~/constants/siteType"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { resolveSelectedCheckInMethod } from "~/services/checkin/autoCheckin/inspection"
import type { AutoCheckinMethodRegistry } from "~/services/checkin/autoCheckin/providers/registry"
import {
  mergeCompatibilityCheckInStatus,
  replaceCheckInMethodDetection,
  replaceCheckInMethodStatus,
} from "~/services/checkin/autoCheckin/state"
import type { SiteAccount } from "~/types"
import type { CheckInConfig, CheckInMethodId } from "~/types/checkIn"

/** Refreshes only the selected method without exposing legacy config fields. */
export async function refreshSelectedStatus(input: {
  config: CheckInConfig
  siteType: AccountSiteType
  account?: SiteAccount
  request?: ApiServiceRequest
  readStatus?: (methodId: CheckInMethodId) => Promise<boolean | undefined>
  registry?: AutoCheckinMethodRegistry
  observedAt?: number
}): Promise<CheckInConfig> {
  const methodId = resolveSelectedCheckInMethod(input)
  if (!methodId) return input.config

  const observedAt = input.observedAt ?? Date.now()
  let isCheckedInToday: boolean | undefined
  if (input.readStatus) {
    isCheckedInToday = await input.readStatus(methodId)
  } else if (input.account || input.request) {
    // Keep the legacy API-service refresh path free of the executable provider
    // graph; loading it eagerly creates a cycle through managed-site adapters.
    const registry =
      input.registry ??
      (await import("~/services/checkin/autoCheckin/providers"))
        .autoCheckinMethodRegistry
    const registration = registry.resolveById(methodId)
    if (!registration?.provider.getStatus) return input.config
    try {
      const status = await registration.provider.getStatus({
        account: input.account,
        request: input.request,
        observedAt,
      })
      return status
        ? replaceCheckInMethodStatus({
            config: input.config,
            methodId,
            status,
          })
        : input.config
    } catch (error) {
      const statusCode = getHttpStatusCode(error)
      return statusCode === 404 || statusCode === 405
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
        : input.config
    }
  }
  if (typeof isCheckedInToday !== "boolean") return input.config

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
