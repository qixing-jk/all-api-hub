import { describe, expect, it, vi } from "vitest"

import { API_TYPES } from "~/services/verification/aiApiVerification"
import {
  createAccountModelVerificationHistoryTarget,
  createProfileModelVerificationHistoryTarget,
  createProfileVerificationHistoryTarget,
  createVerificationHistorySummary,
  deriveVerificationHistoryStatus,
  serializeVerificationHistoryTarget,
  toPersistedProbeSummary,
} from "~/services/verification/verificationResultHistory"
import {
  cloneConfig,
  createDefaultConfig,
} from "~/services/verification/verificationResultHistory/codec"
import { isApiVerificationApiType } from "~/services/verification/verificationResultHistory/utils"

describe("verificationResultHistory utils", () => {
  it("detaches persisted history when structuredClone is unavailable", () => {
    const original = createDefaultConfig()
    vi.stubGlobal("structuredClone", undefined)
    try {
      const detached = cloneConfig(original)
      detached.lastUpdated = 123
      expect(detached.summaries).not.toBe(original.summaries)
      expect(original.lastUpdated).not.toBe(123)
    } finally {
      vi.unstubAllGlobals()
    }
  })
  it("sanitizes persisted probe summaries with truncation and primitive params only", () => {
    const summary = toPersistedProbeSummary({
      id: "models",
      status: "pass",
      latencyMs: -2.7,
      summary: ` ${"x".repeat(300)} `,
      summaryKey: " summary.key ",
      summaryParams: {
        " label ": "  " + "y".repeat(200) + "  ",
        ok: true,
        count: 3,
        nested: { ignore: true },
        blank: "   ",
        nan: Number.NaN,
      },
    } as any)

    expect(summary.latencyMs).toBe(0)
    expect(summary.summary).toHaveLength(240)
    expect(summary.summary.endsWith("...")).toBe(true)
    expect(summary.summaryKey).toBe("summary.key")
    expect(summary.summaryParams).toEqual({
      label: `${"y".repeat(117)}...`,
      ok: true,
      count: 3,
    })
  })

  it("derives resolvedModelId from suggestedModelId before modelIdsPreview", () => {
    const target = createProfileVerificationHistoryTarget("profile-1")
    if (!target) {
      throw new Error("Expected target")
    }

    const summary = createVerificationHistorySummary({
      target,
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      results: [
        {
          id: "models",
          status: "pass",
          summary: "ok",
          output: {
            suggestedModelId: "  gpt-5  ",
            modelIdsPreview: ["model-a", "model-b"],
          },
        },
      ] as any,
    })

    expect(summary?.resolvedModelId).toBe("gpt-5")
    expect(summary?.targetKey).toBe("profile:profile-1")
  })

  it("falls back to the first non-empty preview model when suggestedModelId is unavailable", () => {
    const target = createAccountModelVerificationHistoryTarget(
      "account-1",
      "model-x",
    )
    if (!target) {
      throw new Error("Expected target")
    }

    const summary = createVerificationHistorySummary({
      target,
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      results: [
        {
          id: "models",
          status: "pass",
          summary: "ok",
          output: {
            suggestedModelId: "   ",
            modelIdsPreview: ["   ", 123, " claude-4 "],
          },
        },
      ] as any,
    })

    expect(summary?.resolvedModelId).toBe("claude-4")
    expect(serializeVerificationHistoryTarget(target)).toBe(
      "account:account-1:model:model-x",
    )
  })

  it("uses the preferred model id, rounds verifiedAt, and summarizes failure status", () => {
    const target = createProfileVerificationHistoryTarget("profile-2")
    if (!target) {
      throw new Error("Expected target")
    }

    const summary = createVerificationHistorySummary({
      target,
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      preferredModelId: "  preferred-model  ",
      verifiedAt: -9.4,
      results: [
        {
          id: "models",
          status: "pass",
          summary: "ok",
        },
        {
          id: "text-generation",
          status: "fail",
          summary: "bad",
        },
      ] as any,
    })

    expect(summary?.resolvedModelId).toBe("preferred-model")
    expect(summary?.verifiedAt).toBe(0)
    expect(summary?.status).toBe("fail")
    expect(deriveVerificationHistoryStatus(summary?.probes ?? [])).toBe("fail")
  })

  it("creates and serializes profile-model targets and rejects empty ids", () => {
    const target = createProfileModelVerificationHistoryTarget(
      " profile-3 ",
      " model-3 ",
    )

    expect(target).toEqual({
      kind: "profile-model",
      profileId: "profile-3",
      modelId: "model-3",
    })
    expect(target && serializeVerificationHistoryTarget(target)).toBe(
      "profile:profile-3:model:model-3",
    )
    expect(
      createProfileModelVerificationHistoryTarget(" ", "model-3"),
    ).toBeNull()
    expect(
      createProfileModelVerificationHistoryTarget("profile-3", " "),
    ).toBeNull()
  })

  it("returns undefined when model resolution output is absent or unusable", () => {
    const target = createProfileVerificationHistoryTarget("profile-4")
    if (!target) {
      throw new Error("Expected target")
    }

    const missingOutput = createVerificationHistorySummary({
      target,
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      results: [
        {
          id: "models",
          status: "pass",
          summary: "ok",
        },
      ] as any,
    })

    const unusablePreview = createVerificationHistorySummary({
      target,
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      results: [
        {
          id: "models",
          status: "pass",
          summary: "ok",
          output: {
            suggestedModelId: "",
            modelIdsPreview: [0, null, "   "],
          },
        },
      ] as any,
    })

    expect(missingOutput?.resolvedModelId).toBeUndefined()
    expect(unusablePreview?.resolvedModelId).toBeUndefined()
  })

  it("validates supported api types", () => {
    expect(isApiVerificationApiType(API_TYPES.OPENAI_COMPATIBLE)).toBe(true)
    expect(isApiVerificationApiType("not-a-real-api")).toBe(false)
    expect(isApiVerificationApiType(123)).toBe(false)
  })
})
