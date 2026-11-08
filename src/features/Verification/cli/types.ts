import {
  type API_VERIFICATION_REQUEST_PROFILES,
  type ApiVerificationRequestProfile,
} from "~/services/verification/aiApiVerification"
import type { DisplaySiteData } from "~/types"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"

/**
 * Props for {@link VerifyCliSupportDialog}.
 */
type VerifyCliSupportDialogBaseProps = {
  isOpen: boolean
  onClose: () => void
  initialClient?: Exclude<
    ApiVerificationRequestProfile,
    typeof API_VERIFICATION_REQUEST_PROFILES.Default
  >
  initialModelId?: string
}

export type VerifyCliSupportDialogProps =
  | (VerifyCliSupportDialogBaseProps & {
      account: DisplaySiteData
      modelEnableGroups?: string[]
      profile?: never
    })
  | (VerifyCliSupportDialogBaseProps & {
      profile: ApiCredentialProfile
      account?: never
    })
