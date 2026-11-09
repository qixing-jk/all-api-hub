import type {
  ApiVerificationProbeId,
  ApiVerificationProbeResult,
  ApiVerificationRequestProfile,
} from "~/services/verification/aiApiVerification"
import type { DisplaySiteData } from "~/types"

/**
 * Props for {@link VerifyApiDialog}.
 */
export type VerifyApiDialogProps = {
  isOpen: boolean
  onClose: () => void
  account: DisplaySiteData
  initialRequestProfile?: ApiVerificationRequestProfile
  initialModelId?: string
  initialSupportedEndpointTypes?: string[]
  modelEnableGroups?: string[]
  onManageModelKey?: () => void
}

/**
 * Local UI state for a single probe row.
 */
export type ProbeItemState = {
  definition: { id: ApiVerificationProbeId; requiresModelId: boolean }
  isRunning: boolean
  attempts: number
  result: ApiVerificationProbeResult | null
  /** The displayed result was restored from a persisted summary. */
  historical?: boolean
}

/** Source identity shown by the shared verification header. */
export const VERIFICATION_SOURCE_KINDS = {
  Account: "account",
  Profile: "profile",
} as const

export type VerificationSourceKind =
  (typeof VERIFICATION_SOURCE_KINDS)[keyof typeof VERIFICATION_SOURCE_KINDS]
