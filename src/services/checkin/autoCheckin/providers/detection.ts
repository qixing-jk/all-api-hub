import {
  CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_DETECTION_OUTCOMES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_UNKNOWN_REASON_CODES,
} from "~/constants/checkIn"
import { getCheckInMethodUnknownReason } from "~/services/checkin/autoCheckin/errors"
import type { CheckInMethodStatus } from "~/types/checkIn"

import type {
  AutoCheckinProviderDetectResult,
  AutoCheckinProviderReadContext,
} from "./contracts"

type StatusReader = (
  context: AutoCheckinProviderReadContext,
) => Promise<CheckInMethodStatus | undefined>

const getHttpStatusCode = (error: unknown): number | undefined =>
  error && typeof error === "object" && "statusCode" in error
    ? typeof error.statusCode === "number"
      ? error.statusCode
      : undefined
    : undefined

/** Converts one provider-owned safe status GET into strict discovery evidence. */
export async function detectWithStatusReadback(
  context: AutoCheckinProviderReadContext,
  readStatus: StatusReader,
): Promise<AutoCheckinProviderDetectResult> {
  try {
    const status = await readStatus(context)
    if (!status) {
      return {
        outcome: CHECK_IN_METHOD_DETECTION_OUTCOMES.Unknown,
        reason: CHECK_IN_METHOD_UNKNOWN_REASON_CODES.InvalidResponse,
        attemptedAt: context.observedAt,
      }
    }
    if (status.outcome === CHECK_IN_METHOD_STATUS_OUTCOMES.Unknown) {
      return {
        outcome: CHECK_IN_METHOD_DETECTION_OUTCOMES.Unknown,
        reason: status.reason,
        attemptedAt: status.attemptedAt,
      }
    }
    return {
      detection: {
        outcome: CHECK_IN_METHOD_DETECTION_OUTCOMES.Matched,
        evidence: {
          source: CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES.Probe,
          observedAt: context.observedAt,
        },
      },
      status,
    }
  } catch (error) {
    const statusCode = getHttpStatusCode(error)
    if (statusCode === 404 || statusCode === 405) {
      return {
        outcome: CHECK_IN_METHOD_DETECTION_OUTCOMES.Unsupported,
        evidence: {
          source: CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES.Probe,
          observedAt: context.observedAt,
        },
      }
    }
    return {
      outcome: CHECK_IN_METHOD_DETECTION_OUTCOMES.Unknown,
      reason: getCheckInMethodUnknownReason(error),
      attemptedAt: context.observedAt,
    }
  }
}
