import { beforeEach, describe, expect, it } from "vitest"

import { Storage } from "@plasmohq/storage"

import { API_VERIFICATION_HISTORY_STORAGE_KEYS } from "~/services/core/storageKeys"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import {
  createAccountModelVerificationHistoryTarget,
  createProfileModelVerificationHistoryTarget,
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
    if (!target) {
      throw new Error("Expected history target")
    }

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
    if (!target) {
      throw new Error("Expected history target")
    }

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
    if (!target) {
      throw new Error("Expected history target")
    }

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

  it("returns null for empty trimmed target identifiers", () => {
    expect(createProfileVerificationHistoryTarget("   ")).toBeNull()
    expect(
      createProfileModelVerificationHistoryTarget("profile-1", "   "),
    ).toBeNull()
    expect(
      createAccountModelVerificationHistoryTarget("   ", "model-1"),
    ).toBeNull()
  })

  it("rehydrates legacy raw storage across target kinds and drops invalid summaries", async () => {
    const storage = new Storage({ area: "local" })

    await storage.set(
      API_VERIFICATION_HISTORY_STORAGE_KEYS.VERIFICATION_RESULT_HISTORY,
      {
        version: 0,
        lastUpdated: 0,
        summaries: [
          {
            target: {
              kind: "profile-model",
              profileId: " profile-1 ",
              modelId: " gpt-4.1 ",
            },
            apiType: API_TYPES.OPENAI_COMPATIBLE,
            status: "unsupported",
            verifiedAt: -5,
            resolvedModelId: " resolved-model ",
            probes: [
              {
                id: "models",
                status: "unsupported",
                latencyMs: -2.4,
                summary: "  fetched \n models  ",
                summaryKey: " summary.key ",
                summaryParams: {
                  " bool ": true,
                  count: 2,
                  text: "  spaced value  ",
                  blank: "   ",
                  nested: { keep: false },
                  nan: Number.NaN,
                  "   ": "ignored",
                },
              },
            ],
          },
          {
            target: {
              kind: "account-model",
              accountId: " account-1 ",
              modelId: " claude-3.7 ",
            },
            apiType: API_TYPES.OPENAI_COMPATIBLE,
            status: "pass",
            verifiedAt: 12.6,
            probes: [
              {
                id: "models",
                status: "pass",
                latencyMs: 4.6,
                summary: " ok ",
              },
            ],
          },
          {
            target: {
              kind: "account-model",
              accountId: "account-1",
              modelId: "claude-3.7",
            },
            apiType: API_TYPES.OPENAI_COMPATIBLE,
            status: "fail",
            verifiedAt: 30,
            probes: [
              {
                id: "models",
                status: "fail",
                latencyMs: 1,
                summary: "duplicate should be dropped",
              },
            ],
          },
          {
            target: {
              kind: "mystery-kind",
              profileId: "nope",
            },
            apiType: API_TYPES.OPENAI_COMPATIBLE,
            probes: [
              {
                id: "models",
                status: "pass",
                summary: "invalid target",
              },
            ],
          },
          {
            target: {
              kind: "profile",
              profileId: "profile-invalid-api",
            },
            apiType: "invalid-api-type",
            probes: [
              {
                id: "models",
                status: "pass",
                summary: "invalid api type",
              },
            ],
          },
          {
            target: {
              kind: "profile",
              profileId: "profile-invalid-probe",
            },
            apiType: API_TYPES.OPENAI_COMPATIBLE,
            probes: [
              {
                id: "unknown-probe",
                status: "pass",
                summary: "invalid probe",
              },
            ],
          },
        ],
      },
    )

    const summaries = await verificationResultHistoryStorage.listSummaries()

    expect(summaries).toHaveLength(2)
    expect(summaries[0]).toEqual({
      target: {
        kind: "profile-model",
        profileId: "profile-1",
        modelId: "gpt-4.1",
      },
      targetKey: "profile:profile-1:model:gpt-4.1",
      status: "pass",
      verifiedAt: expect.any(Number),
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      resolvedModelId: "resolved-model",
      probes: [
        {
          id: "models",
          status: "unsupported",
          latencyMs: 0,
          summary: "fetched models",
          summaryKey: "summary.key",
          summaryParams: {
            bool: true,
            count: 2,
            text: "spaced value",
          },
        },
      ],
    })
    expect(summaries[1]).toEqual({
      target: {
        kind: "account-model",
        accountId: "account-1",
        modelId: "claude-3.7",
      },
      targetKey: "account:account-1:model:claude-3.7",
      status: "pass",
      verifiedAt: 13,
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      resolvedModelId: undefined,
      probes: [
        {
          id: "models",
          status: "pass",
          latencyMs: 5,
          summary: "ok",
          summaryKey: undefined,
          summaryParams: undefined,
        },
      ],
    })
  })

  it("returns keyed summaries for requested targets and an empty map for no targets", async () => {
    const profileTarget = createProfileModelVerificationHistoryTarget(
      "profile-9",
      "gpt-5",
    )
    const accountTarget = createAccountModelVerificationHistoryTarget(
      "account-9",
      "claude-4",
    )
    const missingTarget =
      createProfileVerificationHistoryTarget("missing-profile")

    if (!profileTarget || !accountTarget || !missingTarget) {
      throw new Error("Expected history targets")
    }

    const profileSummary = createVerificationHistorySummary({
      target: profileTarget,
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      results: [
        {
          id: "models",
          status: "pass",
          latencyMs: 6,
          summary: "profile summary",
        },
      ],
    })
    const accountSummary = createVerificationHistorySummary({
      target: accountTarget,
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      results: [
        {
          id: "models",
          status: "fail",
          latencyMs: 9,
          summary: "account summary",
        },
      ],
    })

    if (!profileSummary || !accountSummary) {
      throw new Error("Expected verification summaries")
    }

    await verificationResultHistoryStorage.upsertLatestSummary(profileSummary)
    await verificationResultHistoryStorage.upsertLatestSummary(accountSummary)

    expect(
      await verificationResultHistoryStorage.getLatestSummaries([]),
    ).toEqual({})

    expect(
      await verificationResultHistoryStorage.getLatestSummaries([
        profileTarget,
        missingTarget,
        accountTarget,
      ]),
    ).toEqual({
      [profileSummary.targetKey]: expect.objectContaining({
        targetKey: profileSummary.targetKey,
        status: "pass",
      }),
      [accountSummary.targetKey]: expect.objectContaining({
        targetKey: accountSummary.targetKey,
        status: "fail",
      }),
    })
  })

  it("returns false when clearing a target that has no stored summary", async () => {
    const target = createProfileVerificationHistoryTarget("never-stored")
    if (!target) {
      throw new Error("Expected history target")
    }

    await expect(
      verificationResultHistoryStorage.clearTarget(target),
    ).resolves.toBe(false)
  })

  it("returns the newest API verification summary for each profile", async () => {
    const profileTarget = createProfileVerificationHistoryTarget("profile-1")
    const olderModelTarget = createProfileModelVerificationHistoryTarget(
      "profile-1",
      "older-model",
    )
    const newerModelTarget = createProfileModelVerificationHistoryTarget(
      "profile-1",
      "newer-model",
    )
    if (!profileTarget || !olderModelTarget || !newerModelTarget) {
      throw new Error("Expected history targets")
    }

    for (const [target, verifiedAt] of [
      [profileTarget, 50],
      [olderModelTarget, 100],
      [newerModelTarget, 200],
    ] as const) {
      const summary = createVerificationHistorySummary({
        target,
        apiType: API_TYPES.OPENAI_COMPATIBLE,
        verifiedAt,
        results: [
          {
            id: "text-generation",
            status: "pass",
            latencyMs: 1,
            summary: "Generated text",
          },
        ],
      })
      if (!summary) throw new Error("Expected verification summary")
      await verificationResultHistoryStorage.upsertLatestSummary(summary)
    }

    const accountTarget = createAccountModelVerificationHistoryTarget(
      "account-1",
      "account-model",
    )
    if (!accountTarget) throw new Error("Expected account history target")
    const accountSummary = createVerificationHistorySummary({
      target: accountTarget,
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      verifiedAt: 300,
      results: [
        {
          id: "models",
          status: "pass",
          latencyMs: 1,
          summary: "Account model",
        },
      ],
    })
    if (!accountSummary) throw new Error("Expected account summary")
    await verificationResultHistoryStorage.upsertLatestSummary(accountSummary)

    await expect(
      verificationResultHistoryStorage.getLatestProfileSummaries([
        "   ",
        "profile-1",
        "missing-profile",
      ]),
    ).resolves.toEqual({
      "profile:profile-1": expect.objectContaining({
        targetKey: "profile:profile-1:model:newer-model",
        verifiedAt: 200,
      }),
    })
  })

  it("returns no latest profile summaries for empty identifiers", async () => {
    await expect(
      verificationResultHistoryStorage.getLatestProfileSummaries(["", "   "]),
    ).resolves.toEqual({})
  })

  it("rejects invalid summaries before writing to storage", async () => {
    await expect(
      verificationResultHistoryStorage.upsertLatestSummary({
        target: {
          kind: "profile",
          profileId: "profile-1",
        },
        targetKey: "profile:profile-1",
        status: "pass",
        verifiedAt: Date.now(),
        apiType: API_TYPES.OPENAI_COMPATIBLE,
        probes: [],
      } as any),
    ).rejects.toThrow("Invalid verification history summary")
  })
})
