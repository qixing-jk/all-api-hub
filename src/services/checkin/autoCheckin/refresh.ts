import type { AccountSiteType } from "~/constants/siteType"
import { resolveSelectedCheckInMethod } from "~/services/checkin/autoCheckin/inspection"
import { mergeCompatibilityCheckInStatus } from "~/services/checkin/autoCheckin/state"
import type { CheckInConfig, CheckInMethodId } from "~/types/checkIn"

/** Refreshes only the selected method without exposing legacy config fields. */
export async function refreshSelectedStatus(input: {
  config: CheckInConfig
  siteType: AccountSiteType
  readStatus: (methodId: CheckInMethodId) => Promise<boolean | undefined>
  observedAt?: number
}): Promise<CheckInConfig> {
  const methodId = resolveSelectedCheckInMethod(input)
  if (!methodId) return input.config

  const isCheckedInToday = await input.readStatus(methodId)
  if (typeof isCheckedInToday !== "boolean") return input.config

  return mergeCompatibilityCheckInStatus({
    config: input.config,
    methodId,
    isCheckedInToday,
    observedAt: input.observedAt ?? Date.now(),
  })
}
