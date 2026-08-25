import type { TFunction } from "i18next"
import { describe, expect, it } from "vitest"

import {
  AUTO_CHECKIN_METHOD_IDS,
  CHECK_IN_DISCOVERY_DECISION_OUTCOMES,
  CHECK_IN_EXECUTION_SKIP_REASONS,
  CHECK_IN_METHOD_DETECTION_OUTCOMES,
  CHECK_IN_METHOD_UNKNOWN_REASON_CODES,
  CHECK_IN_SELECTION_MODES,
  CHECK_IN_SELECTION_STATUSES,
} from "~/constants/checkIn"
import {
  getCheckInMethodPresentation,
  getCheckInRedetectionFeedbackPresentation,
  getCheckInSelectionPresentation,
} from "~/features/AccountManagement/components/AccountDialog/checkInPresentation"
import type { CheckInAccountState } from "~/types/checkIn"

const t = ((key: string, options?: Record<string, unknown>) =>
  options?.source
    ? `${key}:${options.source}`
    : options?.detail
      ? `${key}:${options.detail}`
      : options?.method
        ? `${key}:${options.method}`
        : options?.error
          ? `${key}:${options.error}`
          : key) as TFunction<"accountDialog">

const createAmbiguousState = (): CheckInAccountState => ({
  decision: {
    outcome: CHECK_IN_DISCOVERY_DECISION_OUTCOMES.Ambiguous,
    methodIds: [
      AUTO_CHECKIN_METHOD_IDS.NewApiDailyCheckIn,
      AUTO_CHECKIN_METHOD_IDS.Sub2ApiProDailyCheckIn,
    ],
  },
  selectionState: {
    mode: CHECK_IN_SELECTION_MODES.Automatic,
    status: CHECK_IN_SELECTION_STATUSES.None,
  },
  choices: [
    {
      methodId: AUTO_CHECKIN_METHOD_IDS.NewApiDailyCheckIn,
      detectionOutcome: CHECK_IN_METHOD_DETECTION_OUTCOMES.Matched,
      selected: false,
    },
    {
      methodId: AUTO_CHECKIN_METHOD_IDS.Sub2ApiProDailyCheckIn,
      detectionOutcome: CHECK_IN_METHOD_DETECTION_OUTCOMES.Matched,
      selected: false,
    },
  ],
  executionEligibility: {
    eligible: false,
    skipReason: CHECK_IN_EXECUTION_SKIP_REASONS.NoSelectedMethod,
  },
  rediscoveryRecommended: false,
})

describe("check-in presentation", () => {
  it("discloses third-party method sources without changing official labels", () => {
    expect(
      getCheckInMethodPresentation(
        t,
        AUTO_CHECKIN_METHOD_IDS.NewApiDailyCheckIn,
      ),
    ).toEqual({
      label: "form.dailyCheckInMethod",
      disclosure: null,
    })
    expect(
      getCheckInMethodPresentation(
        t,
        AUTO_CHECKIN_METHOD_IDS.Sub2ApiProDailyCheckIn,
      ),
    ).toEqual({
      label: "form.thirdPartyDailyCheckInMethod:Sub2API Pro",
      disclosure: "form.thirdPartyCheckInMethodDesc:Sub2API Pro",
    })
  })

  it("keeps an ambiguous automatic selection actionable", () => {
    expect(
      getCheckInSelectionPresentation(t, createAmbiguousState(), {
        mode: CHECK_IN_SELECTION_MODES.Automatic,
      }),
    ).toMatchObject({
      selectedMethodId: undefined,
      selectedMethodDisclosure: null,
      triggerLabel:
        "form.automaticCheckInSelectionWithDetail:form.checkInMethodNeedsChoice",
      helperText: "form.checkInSelectionAutomaticNeedsChoice",
    })
  })

  it("joins classified unknown reasons and only asks to save a changed draft", () => {
    expect(
      getCheckInRedetectionFeedbackPresentation(t, {
        kind: "completed",
        decisionOutcome: CHECK_IN_DISCOVERY_DECISION_OUTCOMES.Unknown,
        selectedMethodDisabled: false,
        saveRequired: false,
        unknownReasons: [
          CHECK_IN_METHOD_UNKNOWN_REASON_CODES.Network,
          CHECK_IN_METHOD_UNKNOWN_REASON_CODES.Timeout,
        ],
      }),
    ).toEqual({
      tone: "warning",
      title: "messages.checkInRedetectUnknown",
      description:
        "messages.checkInRedetectUnknownReasons.network messages.checkInRedetectUnknownReasons.timeout",
    })
  })

  it("keeps the save instruction alongside unknown reasons", () => {
    expect(
      getCheckInRedetectionFeedbackPresentation(t, {
        kind: "completed",
        decisionOutcome: CHECK_IN_DISCOVERY_DECISION_OUTCOMES.Unknown,
        selectedMethodDisabled: false,
        saveRequired: true,
        unknownReasons: [CHECK_IN_METHOD_UNKNOWN_REASON_CODES.Network],
      }),
    ).toEqual({
      tone: "warning",
      title: "messages.checkInRedetectUnknown",
      description:
        "messages.checkInRedetectSaveRequired messages.checkInRedetectUnknownReasons.network",
    })
  })

  it("falls back when a failed redetection message is empty", () => {
    expect(
      getCheckInRedetectionFeedbackPresentation(t, {
        kind: "failed",
        message: "  ",
      }),
    ).toEqual({
      tone: "destructive",
      title: "messages.operationFailed:messages.checkInRedetectUnknown",
    })
  })
})
