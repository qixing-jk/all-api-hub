import { beforeEach, describe, expect, it } from "vitest"

import { Storage } from "@plasmohq/storage"

import { API_VERIFICATION_HISTORY_STORAGE_KEYS } from "~/services/core/storageKeys"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import {
  createProfileVerificationHistoryTarget,
  createVerificationHistorySummary,
  verificationResultHistoryStorage,
} from "~/services/verification/verificationResultHistory"

describe("verificationResultHistoryStorage", () => {
  beforeEach(async () => {
    await verificationResultHistoryStorage.clearAllData()
  })

  it("stores and returns the latest sanitized summary for a target", async () => {
    const target = createProfileVerificationHistoryTarget("p-1")
    const summary = createVerificationHistorySummary({
      target,
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      results: [
        {
          id: "models",
          status: "pass",
          latencyMs: 12,
          summary: "Fetched models",
          summaryKey: "verifyDialog.summaries.modelsFetched",
          summaryParams: { count: 2, ignored: { nested: true } },
          input: { endpoint: "/v1/models" },
          output: { modelCount: 2 },
        },
      ],
    })

    if (!summary) {
      throw new Error("Expected verification summary")
    }

    await verificationResultHistoryStorage.upsertLatestSummary(summary)

    const stored =
      await verificationResultHistoryStorage.getLatestSummary(target)
    expect(stored?.targetKey).toBe("profile:p-1")
    expect(stored?.status).toBe("pass")
    expect(stored?.probes[0]).toEqual({
      id: "models",
      status: "pass",
      latencyMs: 12,
      summary: "Fetched models",
      summaryKey: "verifyDialog.summaries.modelsFetched",
      summaryParams: { count: 2 },
    })
  })

  it("replaces an existing summary for the same target and clears it", async () => {
    const target = createProfileVerificationHistoryTarget("p-1")
    const firstSummary = createVerificationHistorySummary({
      target,
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      results: [
        {
          id: "models",
          status: "pass",
          latencyMs: 8,
          summary: "Pass",
        },
      ],
    })
    const secondSummary = createVerificationHistorySummary({
      target,
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      results: [
        {
          id: "models",
          status: "fail",
          latencyMs: 3,
          summary: "Fail",
        },
      ],
    })

    if (!firstSummary || !secondSummary) {
      throw new Error("Expected verification summaries")
    }

    await verificationResultHistoryStorage.upsertLatestSummary(firstSummary)
    await verificationResultHistoryStorage.upsertLatestSummary(secondSummary)

    const summaries = await verificationResultHistoryStorage.listSummaries()
    expect(summaries).toHaveLength(1)
    expect(summaries[0]?.status).toBe("fail")

    const cleared = await verificationResultHistoryStorage.clearTarget(target)
    expect(cleared).toBe(true)
    expect(
      await verificationResultHistoryStorage.getLatestSummary(target),
    ).toBeNull()
  })

  it("stores data under the dedicated storage key", async () => {
    const storage = new Storage({ area: "local" })
    const target = createProfileVerificationHistoryTarget("p-2")
    const summary = createVerificationHistorySummary({
      target,
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      results: [
        {
          id: "models",
          status: "pass",
          latencyMs: 4,
          summary: "Stored",
        },
      ],
    })

    if (!summary) {
      throw new Error("Expected verification summary")
    }

    await verificationResultHistoryStorage.upsertLatestSummary(summary)

    expect(
      await storage.get(
        API_VERIFICATION_HISTORY_STORAGE_KEYS.VERIFICATION_RESULT_HISTORY,
      ),
    ).toBeTruthy()
  })
})
