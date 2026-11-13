import type {
  ApiVerificationProbeId,
  ApiVerificationProbeResult,
  ApiVerificationRequestProfile,
} from "~/services/verification/aiApiVerification"
import type { VerificationGenerationProgress } from "~/services/verification/aiApiVerification/generationProgress"
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
  progress?: VerificationGenerationProgress
  startedAt?: number
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

/** Presentation states stay independent from test outcome semantics. */
export const VERIFICATION_RAIL_STATUS_VARIANTS = {
  Success: "success",
  Danger: "danger",
  Warning: "warning",
  Running: "running",
  Idle: "idle",
} as const
export type VerificationRailStatusVariant =
  (typeof VERIFICATION_RAIL_STATUS_VARIANTS)[keyof typeof VERIFICATION_RAIL_STATUS_VARIANTS]

export const VERIFICATION_TOOL_STATUSES = {
  Idle: "idle",
  Running: "running",
  Done: "done",
  Stopped: "stopped",
  Error: "error",
} as const

export type VerificationToolStatus =
  (typeof VERIFICATION_TOOL_STATUSES)[keyof typeof VERIFICATION_TOOL_STATUSES]

/** Compatibility presentation values for interrupted probe results. */
export const VERIFICATION_PROBE_INTERRUPTION_STATUSES = {
  Stopped: "stopped",
  Timeout: "timeout",
} as const

/** Sides shared by the workspace rail and configuration pane. */
export const VERIFICATION_SIDEBAR_SIDES = {
  Left: "left",
  Right: "right",
} as const
export type VerificationSidebarSide =
  (typeof VERIFICATION_SIDEBAR_SIDES)[keyof typeof VERIFICATION_SIDEBAR_SIDES]

/** Local settings failures, distinct from generation failures. */
export const VERIFICATION_SETTINGS_ERROR_PHASES = {
  Load: "load",
  Save: "save",
} as const
export type VerificationSettingsErrorPhase =
  (typeof VERIFICATION_SETTINGS_ERROR_PHASES)[keyof typeof VERIFICATION_SETTINGS_ERROR_PHASES]
