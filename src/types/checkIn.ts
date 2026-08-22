import type {
  AUTO_CHECKIN_METHOD_IDS,
  CHECK_IN_DISCOVERY_DECISION_OUTCOMES,
  CHECK_IN_EXECUTION_SKIP_REASONS,
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_DETECTION_OUTCOMES,
  CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
  CHECK_IN_METHOD_UNKNOWN_REASONS,
  CHECK_IN_SELECTION_MODES,
  CHECK_IN_SELECTION_STALE_REASONS,
  CHECK_IN_SELECTION_STATUSES,
} from "~/constants/checkIn"
import type { TurnstilePreTrigger } from "~/types/turnstile"

/** Independent user-owned custom check-in/bookmark configuration. */
export interface CustomCheckInConfig {
  url?: string
  turnstilePreTrigger?: TurnstilePreTrigger
  redeemUrl?: string
  openRedeemWithCheckIn?: boolean
  isCheckedInToday?: boolean
  lastCheckInDate?: string
}

export type CheckInMethodId =
  (typeof AUTO_CHECKIN_METHOD_IDS)[keyof typeof AUTO_CHECKIN_METHOD_IDS]

declare const unknownPersistedCheckInMethodId: unique symbol

type UnknownPersistedCheckInMethodId = string & {
  readonly [unknownPersistedCheckInMethodId]: true
}

export type PersistedCheckInMethodId =
  | CheckInMethodId
  | UnknownPersistedCheckInMethodId

export type CheckInMethodUnknownReason =
  (typeof CHECK_IN_METHOD_UNKNOWN_REASONS)[number]

export interface CheckInMethodUnknownAttempt {
  reason: CheckInMethodUnknownReason
  attemptedAt: number
}

export type CheckInMethodDetection =
  | {
      outcome: typeof CHECK_IN_METHOD_DETECTION_OUTCOMES.Matched
      evidence:
        | {
            source: typeof CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES.Probe
            observedAt: number
          }
        | {
            source: typeof CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES.LegacyMigration
          }
        | {
            source: typeof CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES.CompatibilityRegistration
          }
      lastUnknownAttempt?: CheckInMethodUnknownAttempt
    }
  | {
      outcome: typeof CHECK_IN_METHOD_DETECTION_OUTCOMES.Unsupported
      evidence: {
        source: typeof CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES.Probe
        observedAt: number
      }
      lastUnknownAttempt?: CheckInMethodUnknownAttempt
    }
  | {
      outcome: typeof CHECK_IN_METHOD_DETECTION_OUTCOMES.Unknown
      reason: CheckInMethodUnknownReason
      attemptedAt: number
    }

export type CheckInMethodStatus =
  | {
      outcome: typeof CHECK_IN_METHOD_STATUS_OUTCOMES.Known
      availability?: (typeof CHECK_IN_METHOD_AVAILABILITIES)[keyof typeof CHECK_IN_METHOD_AVAILABILITIES]
      today?: (typeof CHECK_IN_METHOD_TODAY_STATUSES)[keyof typeof CHECK_IN_METHOD_TODAY_STATUSES]
      evidence:
        | {
            source: typeof CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe
            observedAt: number
          }
        | {
            source: typeof CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Execution
            observedAt: number
          }
        | {
            source: typeof CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.LegacyMigration
            legacyObservedAt?: number
            legacyDayKey?: string
          }
    }
  | {
      outcome: typeof CHECK_IN_METHOD_STATUS_OUTCOMES.Unknown
      reason: CheckInMethodUnknownReason
      attemptedAt: number
    }

export interface CheckInMethodKnowledge {
  detection: CheckInMethodDetection
  status?: CheckInMethodStatus
}

export type CheckInMethodSelection =
  | {
      mode: typeof CHECK_IN_SELECTION_MODES.Automatic
      methodId?: PersistedCheckInMethodId
    }
  | {
      mode: typeof CHECK_IN_SELECTION_MODES.Manual
      methodId: PersistedCheckInMethodId
    }

export interface CheckInConfig {
  automaticExecutionEnabled: boolean
  methodKnowledge: {
    methods: Partial<Record<CheckInMethodId, CheckInMethodKnowledge>>
    lastFullDiscoveryAt?: number
  }
  selection: CheckInMethodSelection
  customCheckIn?: CustomCheckInConfig
}

export type CheckInDiscoveryDecision =
  | {
      outcome: typeof CHECK_IN_DISCOVERY_DECISION_OUTCOMES.Resolved
      methodId: CheckInMethodId
    }
  | {
      outcome: typeof CHECK_IN_DISCOVERY_DECISION_OUTCOMES.Ambiguous
      methodIds: CheckInMethodId[]
    }
  | {
      outcome: typeof CHECK_IN_DISCOVERY_DECISION_OUTCOMES.Unknown
      matchedMethodIds: CheckInMethodId[]
      unknownMethodIds: CheckInMethodId[]
    }
  | { outcome: typeof CHECK_IN_DISCOVERY_DECISION_OUTCOMES.Unsupported }

export interface CheckInInspectionInput {
  config: CheckInConfig
  candidateMethodIds: readonly CheckInMethodId[]
  accountDisabled?: boolean
  globalAutomaticExecutionEnabled?: boolean
  now?: number
  timeZone?: string
}

export type CheckInSelectionStaleReason =
  (typeof CHECK_IN_SELECTION_STALE_REASONS)[keyof typeof CHECK_IN_SELECTION_STALE_REASONS]

export type CheckInSelectionState =
  | {
      mode: CheckInMethodSelection["mode"]
      status: typeof CHECK_IN_SELECTION_STATUSES.None
    }
  | {
      mode: CheckInMethodSelection["mode"]
      status: typeof CHECK_IN_SELECTION_STATUSES.Selected
      methodId: CheckInMethodId
    }
  | {
      mode: CheckInMethodSelection["mode"]
      status: typeof CHECK_IN_SELECTION_STATUSES.Stale
      methodId: PersistedCheckInMethodId
      reason: CheckInSelectionStaleReason
    }

export type CheckInExecutionSkipReason =
  (typeof CHECK_IN_EXECUTION_SKIP_REASONS)[keyof typeof CHECK_IN_EXECUTION_SKIP_REASONS]

export type CheckInExecutionEligibility =
  | { eligible: true; methodId: CheckInMethodId }
  | { eligible: false; skipReason: CheckInExecutionSkipReason }

export interface CheckInMethodChoice {
  methodId: CheckInMethodId
  detectionOutcome: CheckInMethodDetection["outcome"]
  selected: boolean
}

export interface CheckInAccountState {
  decision: CheckInDiscoveryDecision
  selectionState: CheckInSelectionState
  choices: CheckInMethodChoice[]
  executionEligibility: CheckInExecutionEligibility
  rediscoveryRecommended: boolean
}
