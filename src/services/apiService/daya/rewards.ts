import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"
import { isRecord } from "~/utils/core/object"

import { DAYA_ENDPOINTS } from "./constants"
import { fetchDayaIdentity } from "./identity"
import {
  fetchDayaEnvelope,
  invalidDayaResponse,
  withDayaSession,
} from "./transport"

export type DayaCheckInOverview = {
  siteTimezone: string
  /** `claimable:false` means today's grant was already taken. */
  checkInClaimable: boolean
  rewardUsd: number | null
  raw: unknown
}

/** Today's grant state; binding tasks are separate and never parsed as status. */
function parseOverview(data: unknown): DayaCheckInOverview {
  const endpoint = DAYA_ENDPOINTS.RewardsOverview
  if (!isRecord(data)) return invalidDayaResponse(endpoint)
  const record = data
  const checkIn = record.daily_check_in
  if (!isRecord(checkIn)) return invalidDayaResponse(endpoint)
  const daily = checkIn
  if (
    typeof daily.claimable !== "boolean" ||
    (daily.display_amount !== undefined &&
      typeof daily.display_amount !== "number")
  )
    return invalidDayaResponse(endpoint)
  return {
    siteTimezone:
      typeof record.site_timezone === "string" ? record.site_timezone : "",
    checkInClaimable: daily.claimable,
    rewardUsd:
      typeof daily.display_amount === "number" ? daily.display_amount : null,
    raw: data,
  }
}

/** Read today's authoritative check-in state from the authenticated console. */
export async function fetchDayaCheckInOverview(
  request: Parameters<typeof fetchDayaIdentity>[0],
): Promise<DayaCheckInOverview> {
  return withDayaSession(request, async (scoped) => {
    await fetchDayaIdentity(scoped)
    const envelope = await fetchDayaEnvelope(
      scoped,
      DAYA_ENDPOINTS.RewardsOverview,
    )
    return parseOverview(envelope.data)
  })
}

/**
 * Check once, send once. Binding tasks (`bind_phone`/`bind_wechat`/
 * `bind_email`) are account-credential operations and are deliberately not
 * automated; only the daily grant is claimed.
 */
export async function performDayaCheckIn(
  request: Parameters<typeof fetchDayaIdentity>[0],
) {
  return withDayaSession(request, async (scoped) => {
    const overview = await fetchDayaCheckInOverview(scoped)
    if (!overview.checkInClaimable) return { alreadyChecked: true as const }
    const envelope = await fetchDayaEnvelope(scoped, DAYA_ENDPOINTS.CheckIn, {
      method: "POST",
    })
    // The daily grant is USD account credit; keep the site's own payload as
    // evidence instead of inventing a quota amount.
    return {
      alreadyChecked: false as const,
      status: CHECKIN_RESULT_STATUS.SUCCESS,
      rewardUsd: overview.rewardUsd,
      data: envelope.data,
      message:
        typeof envelope.message === "string" ? envelope.message : undefined,
    }
  })
}
