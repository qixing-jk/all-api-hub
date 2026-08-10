import {
  CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_DETECTION_OUTCOMES,
  CHECK_IN_SELECTION_MODES,
} from "~/constants/checkIn"
import type { AccountSiteType } from "~/constants/siteType"
import { getNewAccountCompatibilityMethodIds } from "~/services/checkin/autoCheckin/providers/registry"
import type { CheckInConfig, CustomCheckInConfig } from "~/types/checkIn"

/** Creates a canonical new-account config from pre-registry support evidence. */
export function createCompatibilityCheckInConfig(input: {
  siteType: AccountSiteType
  supported: boolean
  automaticExecutionEnabled: boolean
  customCheckIn?: CustomCheckInConfig
}): CheckInConfig {
  const candidateIds = input.supported
    ? getNewAccountCompatibilityMethodIds(input.siteType)
    : []
  const methodId = candidateIds.length === 1 ? candidateIds[0] : undefined

  return {
    automaticExecutionEnabled: input.automaticExecutionEnabled,
    methodKnowledge: {
      methods: methodId
        ? {
            [methodId]: {
              detection: {
                outcome: CHECK_IN_METHOD_DETECTION_OUTCOMES.Matched,
                evidence: {
                  source:
                    CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES.CompatibilityRegistration,
                },
              },
            },
          }
        : {},
    },
    selection: {
      mode: CHECK_IN_SELECTION_MODES.Automatic,
      ...(methodId ? { methodId } : {}),
    },
    ...(input.customCheckIn ? { customCheckIn: input.customCheckIn } : {}),
  }
}
