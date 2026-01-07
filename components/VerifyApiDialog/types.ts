import type {
  ApiVerificationProbeId,
  ApiVerificationProbeResult,
} from "~/services/apiVerification/types"
import type { DisplaySiteData } from "~/types"

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
