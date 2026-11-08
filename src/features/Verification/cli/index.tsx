import { VerifyApiCredentialProfileDialog } from "~/features/ApiCredentialProfiles/verification/VerifyApiCredentialProfileDialog"
import { VerifyApiDialog } from "~/features/Verification/api"
import type { VerifyCliSupportDialogProps } from "~/features/Verification/cli/types"
import { API_VERIFICATION_REQUEST_PROFILES } from "~/services/verification/aiApiVerification"

/** Preserve existing CLI shortcuts while opening the same capability workspace. */
export function VerifyCliSupportDialog(props: VerifyCliSupportDialogProps) {
  const preset = {
    isOpen: props.isOpen,
    onClose: props.onClose,
    initialModelId: props.initialModelId,
    initialRequestProfile:
      props.initialClient ?? API_VERIFICATION_REQUEST_PROFILES.Claude,
  }
  return props.profile ? (
    <VerifyApiCredentialProfileDialog {...preset} profile={props.profile} />
  ) : (
    <VerifyApiDialog
      {...preset}
      account={props.account}
      modelEnableGroups={props.modelEnableGroups}
    />
  )
}
