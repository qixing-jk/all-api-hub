import {
  CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_DETECTION_OUTCOMES,
  CHECK_IN_SELECTION_MODES,
} from "~/constants/checkIn"
import type { AccountSiteType } from "~/constants/siteType"
import {
  getAutoCheckinCandidateMethodIds,
  getNewAccountCompatibilityMethodIds,
} from "~/services/checkin/autoCheckin/providers/registry"
import type { CheckInConfig, CustomCheckInConfig } from "~/types/checkIn"

/**
 * Defaults a new account into automatic execution intent when its site type
 * has at least one candidate method. Discovery remains the execution gate.
 */
export function getNewAccountAutomaticExecutionDefault(
  siteType: AccountSiteType,
): boolean {
  return getAutoCheckinCandidateMethodIds(siteType).length > 0
}

/** Returns whether legacy compatibility may preselect a new account method. */
export function hasNewAccountCompatibilityRegistration(
  siteType: AccountSiteType,
): boolean {
  return getNewAccountCompatibilityMethodIds(siteType).length > 0
}

/**
 * Applies the candidate-backed default while preserving an explicit choice only
 * when the new site type can still execute automatically.
 */
export function resolveNewAccountAutomaticExecutionEnabled(input: {
  siteType: AccountSiteType
  currentAutomaticExecutionEnabled: boolean
  userPreferenceChanged: boolean
}): boolean {
  const defaultEnabled = getNewAccountAutomaticExecutionDefault(input.siteType)
  return input.userPreferenceChanged && defaultEnabled
    ? input.currentAutomaticExecutionEnabled
    : defaultEnabled
}

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
  // Compatibility activation is definitive only for one registered method;
  // multiple candidates require discovery before automatic selection is safe.
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
