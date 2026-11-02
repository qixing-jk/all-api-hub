import type { TFunction } from "i18next"

import { ACCOUNT_KEY_RESOURCE_FAILURE_CODES as failureCodes } from "~/services/apiAdapters/contracts/accountKeyResource"
import type { ResourceFailure } from "~/services/apiAdapters/contracts/accountKeyResource"

const feedbackMessage = (failure: ResourceFailure, t: TFunction) => {
  switch (failure.code) {
    case failureCodes.Unexpected:
      return t("keyManagement:native.editor.feedback.unexpected")
    case failureCodes.PermissionDenied:
      return t("keyManagement:native.editor.feedback.permissionDenied")
    case failureCodes.AuthenticationFailed:
      return t("keyManagement:native.editor.feedback.authenticationFailed")
    case failureCodes.Unavailable:
      return t("keyManagement:native.editor.feedback.unavailable")
    case failureCodes.MutationStateUncertain:
      return t("keyManagement:native.editor.feedback.uncertain")
    default:
      return t("keyManagement:native.editor.feedback.error")
  }
}

export const feedbackDescription = (failure: ResourceFailure, t: TFunction) => {
  const details = [failure.message, failure.upstreamCode].filter(
    (detail): detail is string => Boolean(detail),
  )
  return [feedbackMessage(failure, t), ...details].join("\n")
}
