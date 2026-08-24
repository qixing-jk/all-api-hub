import type { TFunction } from "i18next"
import { describe, expect, it } from "vitest"

import {
  AUTO_CHECKIN_RUN_RESULT,
  AUTO_CHECKIN_SKIP_REASON,
  getAutoCheckinRunResultFromSummary,
  getAutoCheckinRunResultLabel,
  getAutoCheckinSkipReasonTranslationKey,
  translateAutoCheckinSkipReason,
  type AutoCheckinRunResult,
  type AutoCheckinSkipReason,
} from "~/types/autoCheckin"

const t = ((key: string) => key) as unknown as TFunction

describe("autoCheckin translation helpers", () => {
  it.each([
    [
      AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DATA_MISSING,
      "autoCheckin:skipReasons.account_data_missing",
    ],
    [
      AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DISABLED,
      "autoCheckin:skipReasons.account_disabled",
    ],
    [
      AUTO_CHECKIN_SKIP_REASON.DETECTION_DISABLED,
      "autoCheckin:skipReasons.detection_disabled",
    ],
    [
      AUTO_CHECKIN_SKIP_REASON.METHOD_DISABLED,
      "autoCheckin:skipReasons.method_disabled",
    ],
    [
      AUTO_CHECKIN_SKIP_REASON.AUTO_CHECKIN_DISABLED,
      "autoCheckin:skipReasons.auto_checkin_disabled",
    ],
    [
      AUTO_CHECKIN_SKIP_REASON.ALREADY_CHECKED_TODAY,
      "autoCheckin:skipReasons.already_checked_today",
    ],
    [
      AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE,
      "autoCheckin:skipReasons.status_unavailable",
    ],
    [
      AUTO_CHECKIN_SKIP_REASON.NO_PROVIDER,
      "autoCheckin:skipReasons.no_provider",
    ],
    [
      AUTO_CHECKIN_SKIP_REASON.ACCOUNT_UNAVAILABLE,
      "autoCheckin:skipReasons.account_unavailable",
    ],
    [
      AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED,
      "autoCheckin:skipReasons.authentication_required",
    ],
    [
      AUTO_CHECKIN_SKIP_REASON.CREDENTIALS_MISSING,
      "autoCheckin:skipReasons.credentials_missing",
    ],
    [
      AUTO_CHECKIN_SKIP_REASON.METHOD_NOT_MATCHED,
      "autoCheckin:skipReasons.method_not_matched",
    ],
    [
      AUTO_CHECKIN_SKIP_REASON.METHOD_UNAVAILABLE,
      "autoCheckin:skipReasons.method_unavailable",
    ],
    [
      AUTO_CHECKIN_SKIP_REASON.METHOD_UNSUPPORTED,
      "autoCheckin:skipReasons.method_unsupported",
    ],
    [
      AUTO_CHECKIN_SKIP_REASON.NETWORK_ERROR,
      "autoCheckin:skipReasons.network_error",
    ],
    [
      AUTO_CHECKIN_SKIP_REASON.NO_SELECTED_METHOD,
      "autoCheckin:skipReasons.no_selected_method",
    ],
    [
      AUTO_CHECKIN_SKIP_REASON.PERMISSION_DENIED,
      "autoCheckin:skipReasons.permission_denied",
    ],
    [
      AUTO_CHECKIN_SKIP_REASON.SOURCE_UNAVAILABLE,
      "autoCheckin:skipReasons.source_unavailable",
    ],
    [AUTO_CHECKIN_SKIP_REASON.TIMEOUT, "autoCheckin:skipReasons.timeout"],
  ])(
    "maps skip reason %s to the correct translation key",
    (reason, expected) => {
      expect(getAutoCheckinSkipReasonTranslationKey(reason)).toBe(expected)
      expect(translateAutoCheckinSkipReason(t, reason)).toBe(expected)
    },
  )

  it("falls back for unexpected persisted skip-reason values", () => {
    expect(
      getAutoCheckinSkipReasonTranslationKey(
        "legacy_skip_reason" as AutoCheckinSkipReason,
      ),
    ).toBe("autoCheckin:skipReasons.unknown")
  })

  it.each([
    [AUTO_CHECKIN_RUN_RESULT.SUCCESS, "autoCheckin:status.result.success"],
    [AUTO_CHECKIN_RUN_RESULT.PARTIAL, "autoCheckin:status.result.partial"],
    [AUTO_CHECKIN_RUN_RESULT.FAILED, "autoCheckin:status.result.failed"],
    [AUTO_CHECKIN_RUN_RESULT.SKIPPED, "autoCheckin:status.result.skipped"],
  ])(
    "maps run result %s to the correct localized label",
    (result, expected) => {
      expect(getAutoCheckinRunResultLabel(t, result)).toBe(expected)
    },
  )

  it("falls back for unexpected persisted run-result values", () => {
    expect(
      getAutoCheckinRunResultLabel(t, "legacy_result" as AutoCheckinRunResult),
    ).toBe("common:labels.unknown")
  })

  it("classifies a completed run with zero executions as skipped", () => {
    expect(
      getAutoCheckinRunResultFromSummary({
        executed: 0,
        successCount: 0,
        failedCount: 0,
      }),
    ).toBe(AUTO_CHECKIN_RUN_RESULT.SKIPPED)
  })
})
