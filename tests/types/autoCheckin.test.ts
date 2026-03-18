import type { TFunction } from "i18next"
import { describe, expect, it } from "vitest"

import {
  AUTO_CHECKIN_RUN_RESULT,
  AUTO_CHECKIN_SKIP_REASON,
  getAutoCheckinRunResultLabel,
  getAutoCheckinSkipReasonTranslationKey,
  type AutoCheckinRunResult,
  type AutoCheckinSkipReason,
} from "~/types/autoCheckin"

const t = ((key: string) => key) as unknown as TFunction

describe("autoCheckin translation helpers", () => {
  it("keeps known skip reasons and falls back for unexpected persisted values", () => {
    expect(
      getAutoCheckinSkipReasonTranslationKey(
        AUTO_CHECKIN_SKIP_REASON.NO_PROVIDER,
      ),
    ).toBe("autoCheckin:skipReasons.no_provider")
    expect(
      getAutoCheckinSkipReasonTranslationKey(
        "legacy_skip_reason" as AutoCheckinSkipReason,
      ),
    ).toBe("autoCheckin:skipReasons.unknown")
  })

  it("keeps known run result labels and falls back for unexpected persisted values", () => {
    expect(
      getAutoCheckinRunResultLabel(t, AUTO_CHECKIN_RUN_RESULT.PARTIAL),
    ).toBe("autoCheckin:status.result.partial")
    expect(
      getAutoCheckinRunResultLabel(t, "legacy_result" as AutoCheckinRunResult),
    ).toBe("common:labels.unknown")
  })
})
