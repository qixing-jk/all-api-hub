import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { FREE_API_CHECK_IN_ENDPOINT } from "~/services/apiService/sub2api/checkin/freeApiCheckInProtocol"
import { USER_CHECK_IN_STATUS_ENDPOINT } from "~/services/apiService/sub2api/checkin/userCheckInProtocol"
import type { CheckInMethodId } from "~/types/checkIn"

/**
 * Shared verdicts for a structurally valid success DTO read on a status path.
 * `own` confirms the method's own contract; `foreign` is a recognized sibling
 * contract served on the same path (discovery reads it as "not served here",
 * never as an unknown probe); `unknown` covers everything else — payloads that
 * match no registered discriminator, including unregistered methods. Such a
 * payload keeps its parser's current behavior (usually an inconclusive
 * invalid response), because only a recognized contract may claim "this
 * method is not served here".
 */
export const SIBLING_DTO_VERDICTS = {
  Own: "own",
  Foreign: "foreign",
  Unknown: "unknown",
} as const

export type SiblingDtoVerdict =
  (typeof SIBLING_DTO_VERDICTS)[keyof typeof SIBLING_DTO_VERDICTS]

/**
 * Structural fingerprints that distinguish sibling status DTOs served on the
 * same status-path family. Each entry names one registered method's own
 * contract by fields its DTO is observed to carry and the named sibling never
 * does, plus one observed sibling sample the entry must not claim as its own
 * (the bidirectional self-check in the table's tests).
 *
 * Adapters consult these entries instead of hand-writing per-sibling
 * branches, so a new deployment sharing a status path registers one entry
 * here and existing parsers pick up its foreign classification without
 * edits.
 */
export interface SiblingStatusDtoDiscriminator {
  readonly methodId: CheckInMethodId
  /** The status path whose DTO family this entry distinguishes. */
  readonly endpoint: string
  /** Fields that belong to this method's own status contract alone. */
  readonly ownDtoMatches: (data: Record<string, unknown>) => boolean
  /** An observed sibling sample the entry must not claim as its own. */
  readonly siblingDtoSample: Record<string, unknown>
}

/**
 * Three deployments serve the `/api/v1/user/checkin(/status)` family with
 * distinct DTOs: FreeAPI and Clawhud read `checked_in_today`, the Genius
 * Programmer fork reads `today_checked_in`. FreeAPI's reward window
 * (`min_amount`) and Clawhud's totals (`total_count`) separate the two
 * `checked_in_today` shapes; a payload that carries only
 * `{enabled, checked_in_today}` matches neither fingerprint and stays
 * `unknown` rather than claiming either contract.
 */
export const SIBLING_STATUS_DTO_DISCRIMINATORS = [
  {
    methodId: AUTO_CHECKIN_METHOD_IDS.FreeApiDailyCheckIn,
    endpoint: FREE_API_CHECK_IN_ENDPOINT,
    ownDtoMatches: (data) =>
      data.enabled === true &&
      typeof data.checked_in_today === "boolean" &&
      typeof data.min_amount === "number" &&
      typeof data.max_amount === "number",
    siblingDtoSample: { enabled: true, checked_in_today: false },
  },
  {
    methodId: AUTO_CHECKIN_METHOD_IDS.ClawhudDailyCheckIn,
    endpoint: USER_CHECK_IN_STATUS_ENDPOINT,
    ownDtoMatches: (data) =>
      data.enabled === true &&
      typeof data.checked_in_today === "boolean" &&
      typeof data.total_count === "number" &&
      typeof data.total_amount === "number",
    siblingDtoSample: { enabled: true, checked_in_today: false },
  },
  {
    methodId: AUTO_CHECKIN_METHOD_IDS.GeniusProgrammerDailyCheckIn,
    endpoint: USER_CHECK_IN_STATUS_ENDPOINT,
    ownDtoMatches: (data) =>
      data.enabled === true &&
      typeof data.today_checked_in === "boolean" &&
      Array.isArray(data.recent_records),
    siblingDtoSample: { enabled: true, checked_in_today: false },
  },
] as const satisfies readonly SiblingStatusDtoDiscriminator[]

/** Returns discriminator entries, optionally narrowed to one method's own. */
export function getCheckInFamilyDiscriminators(
  methodId?: CheckInMethodId,
): readonly SiblingStatusDtoDiscriminator[] {
  if (methodId === undefined) return SIBLING_STATUS_DTO_DISCRIMINATORS
  return SIBLING_STATUS_DTO_DISCRIMINATORS.filter(
    (entry) => entry.methodId === methodId,
  )
}

/**
 * Classifies one success-envelope `data` against `methodId`'s registered
 * sibling table. Parsers keep authority over the `own` case; this helper's
 * `foreign` answer is what feeds `ForeignCheckInContractError`.
 */
export function classifySiblingStatusDto(
  methodId: CheckInMethodId | undefined,
  data: Record<string, unknown>,
): SiblingDtoVerdict {
  if (methodId === undefined) return SIBLING_DTO_VERDICTS.Unknown
  const ownEntry = SIBLING_STATUS_DTO_DISCRIMINATORS.find(
    (entry) => entry.methodId === methodId,
  )
  if (!ownEntry) return SIBLING_DTO_VERDICTS.Unknown
  if (ownEntry.ownDtoMatches(data)) return SIBLING_DTO_VERDICTS.Own
  return SIBLING_STATUS_DTO_DISCRIMINATORS.some(
    (entry) => entry.methodId !== methodId && entry.ownDtoMatches(data),
  )
    ? SIBLING_DTO_VERDICTS.Foreign
    : SIBLING_DTO_VERDICTS.Unknown
}
