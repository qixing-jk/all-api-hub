import type { TFunction } from "i18next"

import type { ChannelDialogAdvisoryWarning } from "~/components/dialogs/ChannelDialog/context/ChannelDialogContext"

export const CHANNEL_DIALOG_ADVISORY_WARNING_KINDS = {
  REVIEW_SUGGESTED: "reviewSuggested",
  VERIFICATION_REQUIRED: "verificationRequired",
  EXACT_DUPLICATE: "exactDuplicate",
} as const

export type ChannelDialogAdvisoryWarningKind =
  (typeof CHANNEL_DIALOG_ADVISORY_WARNING_KINDS)[keyof typeof CHANNEL_DIALOG_ADVISORY_WARNING_KINDS]

/**
 * Builds a localized non-blocking warning shown inside the channel dialog when
 * duplicate-review checks yield advisory rather than blocking results.
 */
export function buildChannelDialogAdvisoryWarning(
  t: TFunction,
  kind: ChannelDialogAdvisoryWarningKind,
  options?: {
    channelName?: string
  },
): ChannelDialogAdvisoryWarning {
  if (kind === CHANNEL_DIALOG_ADVISORY_WARNING_KINDS.VERIFICATION_REQUIRED) {
    return {
      kind,
      title: t("channelDialog:warnings.verificationRequired.title"),
      description: t("channelDialog:warnings.verificationRequired.description"),
    }
  }

  if (kind === CHANNEL_DIALOG_ADVISORY_WARNING_KINDS.EXACT_DUPLICATE) {
    return {
      kind,
      title: t("channelDialog:warnings.exactDuplicate.title"),
      description: t("channelDialog:warnings.exactDuplicate.description", {
        channelName: options?.channelName ?? "",
      }),
    }
  }

  return {
    kind,
    title: t("channelDialog:warnings.reviewSuggested.title"),
    description: t("channelDialog:warnings.reviewSuggested.description"),
  }
}
