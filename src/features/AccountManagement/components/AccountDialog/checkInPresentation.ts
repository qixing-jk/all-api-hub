import type { TFunction } from "i18next"

import {
  CHECK_IN_DISCOVERY_DECISION_OUTCOMES,
  CHECK_IN_METHOD_UNKNOWN_REASON_CODES,
  CHECK_IN_SELECTION_MODES,
  CHECK_IN_SELECTION_STATUSES,
} from "~/constants/checkIn"
import type { AccountCheckInRedetectionFeedback } from "~/features/AccountManagement/components/AccountDialog/models"
import {
  AUTO_CHECKIN_METHOD_SOURCE_KINDS,
  getAutoCheckinMethodSource,
} from "~/services/checkin/autoCheckin/providers/registry"
import type {
  CheckInAccountState,
  CheckInMethodId,
  CheckInMethodSelection,
  CheckInMethodUnknownReason,
} from "~/types/checkIn"

/** Returns the user-facing label and source disclosure for one method. */
export function getCheckInMethodPresentation(
  t: TFunction<"accountDialog">,
  methodId: CheckInMethodId,
) {
  const source = getAutoCheckinMethodSource(methodId)
  return source.kind === AUTO_CHECKIN_METHOD_SOURCE_KINDS.ThirdParty
    ? {
        label: t("form.thirdPartyDailyCheckInMethod", {
          source: source.sourceName,
        }),
        disclosure: t("form.thirdPartyCheckInMethodDesc", {
          source: source.sourceName,
        }),
      }
    : {
        label: t("form.dailyCheckInMethod"),
        disclosure: null,
      }
}

/** Derives method-selection copy from one canonical account inspection. */
export function getCheckInSelectionPresentation(
  t: TFunction<"accountDialog">,
  state: CheckInAccountState,
  selection: CheckInMethodSelection,
) {
  const selectedMethodId = state.choices.find(
    (choice) => choice.selected,
  )?.methodId
  const selectedMethod = selectedMethodId
    ? getCheckInMethodPresentation(t, selectedMethodId)
    : {
        label: t("form.checkInMethodNotSelected"),
        disclosure: null,
      }
  const automaticDetail = selectedMethodId
    ? selectedMethod.label
    : state.decision.outcome === CHECK_IN_DISCOVERY_DECISION_OUTCOMES.Ambiguous
      ? t("form.checkInMethodNeedsChoice")
      : state.decision.outcome ===
          CHECK_IN_DISCOVERY_DECISION_OUTCOMES.Unsupported
        ? t("form.checkInMethodUnavailable")
        : t("form.checkInMethodPendingConfirmation")
  const automaticLabel = t("form.automaticCheckInSelectionWithDetail", {
    detail: automaticDetail,
  })

  const helperText =
    state.selectionState.status === CHECK_IN_SELECTION_STATUSES.Stale
      ? t("form.checkInSelectionStale")
      : selection.mode === CHECK_IN_SELECTION_MODES.Manual
        ? t("form.checkInSelectionManual", { method: selectedMethod.label })
        : selectedMethodId
          ? t("form.checkInSelectionAutomatic", {
              method: selectedMethod.label,
            })
          : state.decision.outcome ===
              CHECK_IN_DISCOVERY_DECISION_OUTCOMES.Ambiguous
            ? t("form.checkInSelectionAutomaticNeedsChoice")
            : state.decision.outcome ===
                CHECK_IN_DISCOVERY_DECISION_OUTCOMES.Unsupported
              ? t("form.checkInSelectionAutomaticUnavailable")
              : t("form.checkInSelectionAutomaticPending")

  return {
    selectedMethodId,
    selectedMethodDisclosure: selectedMethod.disclosure,
    triggerLabel:
      selection.mode === CHECK_IN_SELECTION_MODES.Automatic
        ? automaticLabel
        : selectedMethod.label,
    helperText,
  }
}

const getUnknownReasonMessage = (
  t: TFunction<"accountDialog">,
  reason: CheckInMethodUnknownReason,
) => {
  switch (reason) {
    case CHECK_IN_METHOD_UNKNOWN_REASON_CODES.Network:
      return t("messages.checkInRedetectUnknownReasons.network")
    case CHECK_IN_METHOD_UNKNOWN_REASON_CODES.Timeout:
      return t("messages.checkInRedetectUnknownReasons.timeout")
    case CHECK_IN_METHOD_UNKNOWN_REASON_CODES.AuthenticationRequired:
      return t("messages.checkInRedetectUnknownReasons.authentication_required")
    case CHECK_IN_METHOD_UNKNOWN_REASON_CODES.PermissionDenied:
      return t("messages.checkInRedetectUnknownReasons.permission_denied")
    case CHECK_IN_METHOD_UNKNOWN_REASON_CODES.SourceUnavailable:
      return t("messages.checkInRedetectUnknownReasons.source_unavailable")
    case CHECK_IN_METHOD_UNKNOWN_REASON_CODES.IdentityMismatch:
      return t("messages.checkInRedetectUnknownReasons.identity_mismatch")
    case CHECK_IN_METHOD_UNKNOWN_REASON_CODES.InvalidResponse:
      return t("messages.checkInRedetectUnknownReasons.invalid_response")
    case CHECK_IN_METHOD_UNKNOWN_REASON_CODES.CredentialPersistenceFailed:
      return t(
        "messages.checkInRedetectUnknownReasons.credential_persistence_failed",
      )
  }
}

/** Maps classified re-detection feedback to a reusable Notice presentation. */
export function getCheckInRedetectionFeedbackPresentation(
  t: TFunction<"accountDialog">,
  feedback: AccountCheckInRedetectionFeedback | null,
) {
  if (!feedback) return null
  if (feedback.kind === "failed") {
    return { tone: "destructive" as const, title: feedback.message }
  }

  const description = feedback.saveRequired
    ? t("messages.checkInRedetectSaveRequired")
    : undefined
  if (feedback.selectedMethodDisabled) {
    return {
      tone: "warning" as const,
      title: t("messages.checkInRedetectDisabled"),
      description,
    }
  }

  switch (feedback.decisionOutcome) {
    case CHECK_IN_DISCOVERY_DECISION_OUTCOMES.Resolved:
      return {
        tone: "success" as const,
        title: t("messages.checkInRedetectResolved"),
        description,
      }
    case CHECK_IN_DISCOVERY_DECISION_OUTCOMES.Ambiguous:
      return {
        tone: "warning" as const,
        title: t("messages.checkInRedetectAmbiguous"),
        description,
      }
    case CHECK_IN_DISCOVERY_DECISION_OUTCOMES.Unsupported:
      return {
        tone: "info" as const,
        title: t("messages.checkInRedetectUnsupported"),
        description,
      }
    case CHECK_IN_DISCOVERY_DECISION_OUTCOMES.Unknown:
      return {
        tone: "warning" as const,
        title: t("messages.checkInRedetectUnknown"),
        description:
          feedback.unknownReasons.length > 0
            ? feedback.unknownReasons
                .map((reason) => getUnknownReasonMessage(t, reason))
                .join(" ")
            : undefined,
      }
  }
}
