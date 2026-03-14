import type {
  CliSupportResult,
  CliToolId,
} from "~/services/verification/cliSupportVerification"
import type { DisplaySiteData } from "~/types"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"

/**
 * Props for {@link VerifyCliSupportDialog}.
 */
type VerifyCliSupportDialogBaseProps = {
  isOpen: boolean
  onClose: () => void
  initialModelId?: string
}

export type VerifyCliSupportDialogProps =
  | (VerifyCliSupportDialogBaseProps & {
      account: DisplaySiteData
      profile?: never
    })
  | (VerifyCliSupportDialogBaseProps & {
      profile: ApiCredentialProfile
      account?: never
    })

/**
 * Local UI state for a single tool row.
 */
export type ToolItemState = {
  toolId: CliToolId
  isRunning: boolean
  attempts: number
  result: CliSupportResult | null
}
