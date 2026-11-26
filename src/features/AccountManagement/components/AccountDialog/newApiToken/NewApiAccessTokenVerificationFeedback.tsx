import { useTranslation } from "react-i18next"

import { InlineMessage, Spinner } from "~/components/ui"
import { NEW_API_TOKEN_VALIDATION_STATUSES as VALIDATION_STATUSES } from "~/services/apiService/newApiFamily/accessTokens/protocol"

import {
  TOKEN_VERIFICATION_CHECKING,
  type NewApiAccessTokenVerificationStatus,
} from "./useNewApiAccessTokenVerification"

/** Announces progress and the result of the advisory check. */
export function NewApiAccessTokenVerificationFeedback({
  status,
  created,
}: {
  status?: NewApiAccessTokenVerificationStatus
  created?: boolean
}) {
  const { t } = useTranslation("accountDialog")

  if (!status)
    return created ? (
      <InlineMessage tone="success" size="sm">
        {t("tokenCreation.complete")}
      </InlineMessage>
    ) : (
      <InlineMessage icon={null} />
    )
  if (status === TOKEN_VERIFICATION_CHECKING) {
    return (
      <InlineMessage
        size="sm"
        icon={
          <Spinner
            size="sm"
            variant="current"
            className="size-3.5 motion-reduce:animate-none"
          />
        }
      >
        {t("accessTokenValidation.checking")}
      </InlineMessage>
    )
  }
  if (status === VALIDATION_STATUSES.VALID) {
    return (
      <InlineMessage tone="success" size="sm">
        {t("accessTokenValidation.valid")}
      </InlineMessage>
    )
  }

  const unavailable = status === VALIDATION_STATUSES.UNAVAILABLE
  return (
    <InlineMessage tone={unavailable ? "neutral" : "warning"} size="sm">
      {unavailable
        ? t("accessTokenValidation.unavailable")
        : status === VALIDATION_STATUSES.IDENTITY_MISMATCH
          ? t("accessTokenValidation.identityMismatch")
          : t("accessTokenValidation.invalid")}
    </InlineMessage>
  )
}
