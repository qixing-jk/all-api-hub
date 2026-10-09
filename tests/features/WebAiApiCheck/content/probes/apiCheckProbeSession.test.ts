import { describe, expect, it, vi } from "vitest"

import { createApiCheckProbeSession } from "~/features/WebAiApiCheck/content/probes/apiCheckProbeSession"
import type { ApiVerificationProbeResult } from "~/services/verification/aiApiVerification"

const context = {
  apiType: "openai-compatible" as const,
  baseUrl: "https://proxy.example.com",
  apiKey: "test-key",
  modelId: "test-model",
}
const result: ApiVerificationProbeResult = {
  id: "text-generation",
  status: "pass",
  latencyMs: 0,
  summary: "accepted result",
  input: { apiType: context.apiType, baseUrl: context.baseUrl },
}

describe("API check result admission", () => {
  it.each(["cancelled", "replaced", "reset", "finished"] as const)(
    "rejects late results from a %s run without overwriting accepted results",
    (change) => {
      const cancelRun = vi.fn(async () => undefined)
      const session = createApiCheckProbeSession({ cancelRun })
      const old = session.beginProbe(result.id, "old", null, context)
      expect(old.acceptResult(result)).toBe(true)
      if (change === "cancelled") session.stopProbe(result.id, {})
      if (change === "replaced") {
        session
          .beginProbe(result.id, "new", null, context)
          .acceptResult({ ...result, summary: "new result" })
      }
      if (change === "reset") session.reset()
      if (change === "finished") old.finish()
      expect(old.acceptResult({ ...result, summary: "late result" })).toBe(
        false,
      )
      expect(
        session.resultsForContext(context).map((item) => item.summary),
      ).toEqual(
        change === "reset"
          ? []
          : [change === "replaced" ? "new result" : "accepted result"],
      )
    },
  )

  it("stops a batch before its first probe without cancelling an unrelated run", () => {
    const cancelRun = vi.fn(async () => undefined)
    const session = createApiCheckProbeSession({ cancelRun })
    const independent = session.beginProbe(
      result.id,
      "independent",
      null,
      context,
    )
    const batch = session.beginBatch()
    expect(session.stopBatch()).toBe(true)
    expect(batch.isStopped()).toBe(true)
    expect(session.stopBatch()).toBe(false)
    expect(cancelRun).not.toHaveBeenCalled()
    expect(independent.acceptResult(result)).toBe(true)
  })
})
