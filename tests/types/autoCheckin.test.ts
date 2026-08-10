import type { TFunction } from "i18next"
import { describe, expect, it } from "vitest"

import {
  AUTO_CHECKIN_RUN_RESULT,
  AUTO_CHECKIN_SKIP_REASON,
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
      AUTO_CHECKIN_SKIP_REASON.NO_PROVIDER,
      "autoCheckin:skipReasons.no_provider",
    ],
    [
      AUTO_CHECKIN_SKIP_REASON.PROVIDER_NOT_READY,
      "autoCheckin:skipReasons.provider_not_ready",
    ],
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
})
