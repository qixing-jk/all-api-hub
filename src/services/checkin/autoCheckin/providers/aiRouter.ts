import {
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_DETECTION_OUTCOMES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
} from "~/constants/checkIn"
import {
  AI_ROUTER_DAILY_CHECK_IN_RESULT_KINDS,
  AI_ROUTER_STATUS_OUTCOMES,
  performAiRouterDailyCheckIn,
  probeAiRouterDailyCheckInStatus,
} from "~/services/apiService/sub2api/aiRouterCheckIn"
import { getCheckInMethodUnknownReason } from "~/services/checkin/autoCheckin/errors"
import { AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS } from "~/services/checkin/autoCheckin/providers/shared"
import type { SiteAccount } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
} from "~/types/autoCheckin"
import type { CheckInMethodUnknownReason } from "~/types/checkIn"

import type {
  AutoCheckinProvider,
  AutoCheckinProviderReadContext,
} from "./contracts"
import {
  createSub2ApiCheckInMutationRequest,
  createSub2ApiCheckInReadRequest,
  failedSub2ApiCheckIn,
  getSub2ApiCheckInReadiness,
  mapSub2ApiCheckInMutationError,
  toSub2ApiCheckInStatus,
} from "./sub2apiShared"

const unknownStatus = (
  reason: CheckInMethodUnknownReason,
  attemptedAt: number,
) =>
  ({
    outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Unknown,
    reason,
    attemptedAt,
  }) as const

const unsupportedDetection = (observedAt: number) =>
  ({
    outcome: CHECK_IN_METHOD_DETECTION_OUTCOMES.Unsupported,
    evidence: {
      source: CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES.Probe,
      observedAt,
    },
  }) as const

const unknownDetection = (
  reason: CheckInMethodUnknownReason,
  attemptedAt: number,
) =>
  ({
    outcome: CHECK_IN_METHOD_DETECTION_OUTCOMES.Unknown,
    reason,
    attemptedAt,
  }) as const

const readStatus = async (context: AutoCheckinProviderReadContext) => {
  try {
    const probe = await probeAiRouterDailyCheckInStatus(
      createSub2ApiCheckInReadRequest(context),
    )
    if (probe.outcome !== AI_ROUTER_STATUS_OUTCOMES.Matched) {
      return unknownStatus(
        probe.outcome === AI_ROUTER_STATUS_OUTCOMES.Unknown
          ? probe.reason
          : "invalid_response",
        context.observedAt,
      )
    }
    return toSub2ApiCheckInStatus(probe.status, context.observedAt)
  } catch (error) {
    return unknownStatus(
      getCheckInMethodUnknownReason(error),
      context.observedAt,
    )
  }
}

/**
 * AI-ROUTER's daily check-in. The deployment is registered by origin, so this
 * method is only discovered for accounts on that deployment; it does not send
 * probes to other Sub2API sites.
 */
export const aiRouterProvider: AutoCheckinProvider = {
  requiresAuthoritativeStatusBeforeMutation: true,

  getReadiness: getSub2ApiCheckInReadiness,

  async detect(context) {
    try {
      const probe = await probeAiRouterDailyCheckInStatus(
        createSub2ApiCheckInReadRequest(context),
      )
      if (probe.outcome === AI_ROUTER_STATUS_OUTCOMES.Matched) {
        return {
          detection: {
            outcome: CHECK_IN_METHOD_DETECTION_OUTCOMES.Matched,
            evidence: {
              source: CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES.Probe,
              observedAt: context.observedAt,
            },
          },
          status: toSub2ApiCheckInStatus(probe.status, context.observedAt),
        }
      }
      return probe.outcome === AI_ROUTER_STATUS_OUTCOMES.Unknown
        ? unknownDetection(probe.reason, context.observedAt)
        : unsupportedDetection(context.observedAt)
    } catch (error) {
      return unknownDetection(
        getCheckInMethodUnknownReason(error),
        context.observedAt,
      )
    }
  },

  getStatus: readStatus,

  async checkIn(account, context) {
    const status = context.statusProof
    if (
      status?.availability !== CHECK_IN_METHOD_AVAILABILITIES.Enabled ||
      status.today !== CHECK_IN_METHOD_TODAY_STATUSES.NotChecked
    ) {
      return failedSub2ApiCheckIn(AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE)
    }

    try {
      const result = await performAiRouterDailyCheckIn(
        createSub2ApiCheckInMutationRequest(account as SiteAccount, context),
      )
      switch (result.kind) {
        case AI_ROUTER_DAILY_CHECK_IN_RESULT_KINDS.Applied:
          return {
            status: CHECKIN_RESULT_STATUS.SUCCESS,
            messageKey:
              AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinSuccessful,
            data: result.data,
          }
        case AI_ROUTER_DAILY_CHECK_IN_RESULT_KINDS.AlreadyChecked:
          return {
            status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
            messageKey:
              AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.alreadyCheckedToday,
          }
      }
    } catch (error) {
      return mapSub2ApiCheckInMutationError(error, context)
    }
  },
}
