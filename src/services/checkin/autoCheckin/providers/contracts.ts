import { type CHECK_IN_PROVIDER_READINESS_REASONS } from "~/constants/checkIn"
import type {
  ApiServiceRequest,
  ApiTransportRequestObserver,
} from "~/services/apiTransport/type"
import type { AutoCheckinProviderResult } from "~/services/checkin/autoCheckin/providers/types"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import type { SiteAccount } from "~/types"
import type {
  CheckInMethodDetection,
  CheckInMethodStatus,
} from "~/types/checkIn"
import type { TempWindowRequestSource } from "~/types/tempWindowFetch"

/** Read-only context shared by discovery and selected status refresh. */
export interface AutoCheckinProviderReadContext {
  account?: SiteAccount
  /** Existing refresh transport context; discovery supplies `account`. */
  request?: ApiServiceRequest
  signal?: AbortSignal
  observedAt: number
}

export type AutoCheckinProviderDetectResult =
  | CheckInMethodDetection
  | {
      detection: CheckInMethodDetection
      status?: CheckInMethodStatus
    }

export interface AnyrouterCheckInParams {
  id?: string
  site_url: string
  cookieAuthSessionCookie?: string
  account_info: {
    id: number
  }
}

/** Execution dependencies supplied by the check-in scheduler. */
export interface AutoCheckinMutationLifecycle
  extends ApiTransportRequestObserver {
  dispatched: boolean
  responseReceived: boolean
  onPreHandlerUnauthorized?(): void
}

export interface AutoCheckinProviderContext {
  tempWindowRequestSource: TempWindowRequestSource
  protectionBypassExecution: ProtectionBypassExecution
  /** Process-local evidence for classifying a lost mutation response. */
  mutationLifecycle?: AutoCheckinMutationLifecycle
  /** Fresh status read by the Module in this execution cycle. */
  statusProof?: CheckInMethodStatus
  /** Rechecks current selection and automatic intent before a recovered POST. */
  beforeRecoveredMutation?: () => Promise<boolean>
}

export type AutoCheckinProviderReadiness =
  | { ready: true }
  | {
      ready: false
      reason: (typeof CHECK_IN_PROVIDER_READINESS_REASONS)[keyof typeof CHECK_IN_PROVIDER_READINESS_REASONS]
    }

/** Executable compatibility contract for a registered check-in method. */
export interface AutoCheckinProvider {
  /** This protocol must never mutate without fresh authoritative readback. */
  readonly requiresAuthoritativeStatusBeforeMutation?: boolean
  /** Pinned server idempotency permits a later status-first retry. */
  readonly retryAfterUncertainNotChecked?: boolean
  getReadiness(account: SiteAccount): AutoCheckinProviderReadiness
  /** Optional read-only protocol probe used by full discovery. */
  detect?: (
    context: AutoCheckinProviderReadContext,
  ) => Promise<AutoCheckinProviderDetectResult>
  /** Optional read-only status readback. */
  getStatus?: (
    context: AutoCheckinProviderReadContext,
  ) => Promise<CheckInMethodStatus | undefined>
  checkIn(
    account: SiteAccount | AnyrouterCheckInParams,
    context: AutoCheckinProviderContext,
  ): Promise<AutoCheckinProviderResult>
}
