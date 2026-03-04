import type {
  CliSupportResult,
  CliToolId,
} from "~/src/services/verification/cliSupportVerification"
import type { DisplaySiteData } from "~/src/types"

/**
 * Props for {@link VerifyCliSupportDialog}.
 */
export type VerifyCliSupportDialogProps = {
  isOpen: boolean
  onClose: () => void
  account: DisplaySiteData
  initialModelId?: string
}

/**
 * Local UI state for a single tool row.
 */
export type ToolItemState = {
  toolId: CliToolId
  isRunning: boolean
  attempts: number
  result: CliSupportResult | null
}
