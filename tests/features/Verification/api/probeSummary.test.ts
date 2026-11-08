import { describe, expect, it } from "vitest"

import { getVerificationProbeSummary } from "~/features/Verification/api/probeSummary"
import zhCN from "~/locales/zh-CN/aiApiVerification.json"
import {
  API_VERIFICATION_PROBE_IDS,
  API_VERIFICATION_PROBE_STATUSES,
  type ApiVerificationProbeResult,
} from "~/services/verification/aiApiVerification"
import { createResourceTestI18n } from "~~/tests/test-utils/i18n"

describe("verification probe summary", () => {
  it("preserves translated, unknown, unsupported and empty result precedence", async () => {
    const i18n = await createResourceTestI18n(
      { "zh-CN": { aiApiVerification: zhCN } },
      "zh-CN",
    )
    const probeId = API_VERIFICATION_PROBE_IDS.Models
    const result: ApiVerificationProbeResult = {
      id: probeId,
      status: API_VERIFICATION_PROBE_STATUSES.Unsupported,
      summary: "Sanitized upstream detail",
      latencyMs: 0,
    }
    const summary = (value: ApiVerificationProbeResult | null) =>
      getVerificationProbeSummary(i18n.t, probeId, value)

    expect(summary(null)).toBeNull()
    expect(summary(result)).toBe(
      i18n.t("aiApiVerification:verifyDialog.unsupportedProbeForApiType", {
        probe: zhCN.verifyDialog.probes.models,
      }),
    )
    expect(summary({ ...result, summaryKey: "unknown-summary" })).toBe(
      "Sanitized upstream detail",
    )
    expect(
      summary({ ...result, summaryKey: "verifyDialog.summaries.stopped" }),
    ).toBe(zhCN.verifyDialog.summaries.stopped)
    expect(
      summary({ ...result, status: API_VERIFICATION_PROBE_STATUSES.Fail }),
    ).toBe("Sanitized upstream detail")
    expect(
      summary({
        ...result,
        status: API_VERIFICATION_PROBE_STATUSES.Pass,
        summary: "",
      }),
    ).toBe("")
  })
})
