import type {
  ApiVerificationProbeId,
  ApiVerificationProbeResult,
} from "~/src/services/verification/aiApiVerification"
import type { DisplaySiteData } from "~/src/types"

/**
 * Props for {@link VerifyApiDialog}.
 */
export type VerifyApiDialogProps = {
  isOpen: boolean
  onClose: () => void
  account: DisplaySiteData
  initialModelId?: string
}

/**
 * Local UI state for a single probe row.
 */
export type ProbeItemState = {
  definition: { id: ApiVerificationProbeId; requiresModelId: boolean }
  isRunning: boolean
  attempts: number
  result: ApiVerificationProbeResult | null
}
