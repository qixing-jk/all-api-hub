import type { TFunction } from "i18next"

import type { ResourceFailure } from "~/services/apiAdapters/contracts/accountKeyResource"

const feedbackMessage = (failure: ResourceFailure, t: TFunction) => {
  switch (failure.code) {
    case "permission_denied":
      return t("keyManagement:native.editor.feedback.permissionDenied")
    case "authentication_failed":
      return t("keyManagement:native.editor.feedback.authenticationFailed")
    case "unavailable":
      return t("keyManagement:native.editor.feedback.unavailable")
    case "mutation_state_uncertain":
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
