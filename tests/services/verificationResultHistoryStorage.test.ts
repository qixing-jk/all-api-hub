import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { MockInstance } from "vitest"
import { browser } from "wxt/browser"

import { Storage } from "@plasmohq/storage"

import { accountConfigStore } from "~/services/accounts/accountStorage/accountConfigStore"
import { apiCredentialProfilesStorage } from "~/services/apiCredentialProfiles/apiCredentialProfilesStorage"
import { API_VERIFICATION_HISTORY_STORAGE_KEYS } from "~/services/core/storageKeys"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import type { ApiVerificationHistorySummary } from "~/services/verification/verificationResultHistory"
import {
  createAccountModelVerificationHistoryTarget,
  createProfileModelVerificationHistoryTarget,
  createProfileVerificationHistoryTarget,
  createVerificationHistorySummary,
  verificationResultHistoryStorage,
} from "~/services/verification/verificationResultHistory"
import {
  ORPHAN_SWEEP_INTERVAL_MS,
  VERIFICATION_SUMMARY_MAX_AGE_MS,
} from "~/services/verification/verificationResultHistory/retention"
import { API_VERIFICATION_RESULT_HISTORY_CONFIG_VERSION } from "~/services/verification/verificationResultHistory/types"

describe("verificationResultHistoryStorage", () => {
  let readAccountsSpy: MockInstance
  let listProfileIdsSpy: MockInstance

  const stubLiveOwners = (owners: {
    accountIds?: string[]
    profileIds?: string[]
  }) => {
    readAccountsSpy.mockResolvedValue(
      (owners.accountIds ?? []).map((id) => ({ id })) as any,
    )
    listProfileIdsSpy.mockResolvedValue(owners.profileIds ?? [])
  }

  afterEach(() => vi.restoreAllMocks())

  beforeEach(async () => {
    await verificationResultHistoryStorage.clearAllData()

    // An unreadable owner store means "liveness unknown", which makes the orphan
    // sweep a no-op. Retention tests stub these explicitly so a summary is only
    // reaped when the test says its owner is gone.
    readAccountsSpy = vi
      .spyOn(accountConfigStore, "readAccounts")
      .mockRejectedValue(new Error("accounts unavailable"))
    listProfileIdsSpy = vi
      .spyOn(apiCredentialProfilesStorage, "listProfileIdsOrThrow")
      .mockRejectedValue(new Error("profiles unavailable"))
  })

  it("retains every target now that the entry cap is gone", async () => {
    const seededAt = Date.now()
    const summaries = Array.from(
      { length: 500 },
      (_, index) =>
        createVerificationHistorySummary({
          target: createProfileVerificationHistoryTarget(`profile-${index}`)!,
          apiType: API_TYPES.OPENAI,
          verifiedAt: seededAt,
          results: [
            {
              id: "models",
              status: "pass",
              latencyMs: 1,
              summary: "Available",
            },
          ],
        })!,
    )
    const storage = new Storage({ area: "local" })
    await storage.set(
      API_VERIFICATION_HISTORY_STORAGE_KEYS.VERIFICATION_RESULT_HISTORY,
      {
        version: API_VERIFICATION_RESULT_HISTORY_CONFIG_VERSION,
        summaries,
        lastUpdated: seededAt,
      },
    )
    const added = createVerificationHistorySummary({
      target: createProfileVerificationHistoryTarget("new-profile")!,
      apiType: API_TYPES.OPENAI,
      verifiedAt: seededAt,
      results: [
        { id: "models", status: "pass", latencyMs: 1, summary: "Available" },
      ],
    })!

    await verificationResultHistoryStorage.upsertLatestSummary(added)

    const stored = await verificationResultHistoryStorage.listSummaries()
    expect(stored).toHaveLength(501)
    expect(stored[0]).toEqual(added)
    // The oldest target must survive: the store no longer evicts by count.
    expect(
      stored.some((item) => item.targetKey === summaries[0].targetKey),
    ).toBe(true)
  })

  it("rewrites the whole store per batch write, so written bytes scale with stored entries", async () => {
    const buildSeeded = (index: number): ApiVerificationHistorySummary =>
      createVerificationHistorySummary({
        target: createProfileVerificationHistoryTarget(
          `profile-seed-${index}`,
        )!,
        apiType: API_TYPES.OPENAI,
        results: [
          { id: "models", status: "pass", latencyMs: 1, summary: "Available" },
        ],
      })!

    const setSpy = vi.spyOn(browser.storage.local, "set")

    const measureBatchWriteBytes = async (seededCount: number) => {
      await verificationResultHistoryStorage.clearAllData()
      await verificationResultHistoryStorage.upsertLatestSummaries(
        Array.from({ length: seededCount }, (_, index) => buildSeeded(index)),
      )

      setSpy.mockClear()
      await verificationResultHistoryStorage.upsertLatestSummaries([
        buildSeeded(seededCount + 1),
      ])

      return JSON.stringify(setSpy.mock.calls.at(-1)).length
    }

    const small = await measureBatchWriteBytes(10)
    const large = await measureBatchWriteBytes(1_000)

    // Pins the single-key contract: every batch write serializes all stored
    // summaries, so one write costs O(whole store). Sharding by owner would
    // flatten this ratio, and that change should update this expectation.
    expect(large).toBeGreaterThan(small * 50)
  })

  it("expires summaries older than the retention window on the next write", async () => {
    const expiredTarget =
      createProfileVerificationHistoryTarget("profile-expired")!
    const expired = createVerificationHistorySummary({
      target: expiredTarget,
      apiType: API_TYPES.OPENAI,
      verifiedAt: Date.now() - VERIFICATION_SUMMARY_MAX_AGE_MS - 1000,
      results: [
        { id: "models", status: "pass", latencyMs: 1, summary: "Available" },
      ],
    })!
    await verificationResultHistoryStorage.upsertLatestSummary(expired)

    // The write path itself expires old rows, so a fresh write is enough to
    // collect them without waiting for an orphan sweep.
    const freshTarget = createProfileVerificationHistoryTarget("profile-fresh")!
    const fresh = createVerificationHistorySummary({
      target: freshTarget,
      apiType: API_TYPES.OPENAI,
      results: [
        { id: "models", status: "pass", latencyMs: 1, summary: "Available" },
      ],
    })!
    await verificationResultHistoryStorage.upsertLatestSummary(fresh)

    await expect(
      verificationResultHistoryStorage.listSummaries(),
    ).resolves.toEqual([fresh])
  })

  it.each(["streaming", "non-streaming"] as const)(
    "preserves the tested %s mode when results are persisted and reloaded",
    async (mode) => {
      const target = createProfileVerificationHistoryTarget("p-mode")!
      const summary = createVerificationHistorySummary({
        target,
        apiType: API_TYPES.OPENAI,
        results: [
          {
            id: "text-generation",
            status: "pass",
            latencyMs: 1,
            summary: "Text generation succeeded",
            mode,
          },
        ],
      })!

      await verificationResultHistoryStorage.upsertLatestSummary(summary)
      const stored =
        await verificationResultHistoryStorage.getLatestSummary(target)
      expect(stored?.probes[0]).toMatchObject({ mode })
    },
  )

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
                mode: "unknown-mode",
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
              profileId: "   ",
            },
            apiType: API_TYPES.OPENAI_COMPATIBLE,
            probes: [
              {
                id: "models",
                status: "pass",
                summary: "invalid blank profile target",
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

    const base = Date.now()
    for (const [target, verifiedAt] of [
      [profileTarget, base + 50],
      [olderModelTarget, base + 100],
      [newerModelTarget, base + 200],
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
      verifiedAt: base + 300,
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
        verifiedAt: base + 200,
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

  it("writes one batch with a single storage write", async () => {
    const batch = ["m-1", "m-2", "m-3"].map(
      (modelId) =>
        createVerificationHistorySummary({
          target: createAccountModelVerificationHistoryTarget(
            "account-1",
            modelId,
          )!,
          apiType: API_TYPES.OPENAI,
          results: [
            {
              id: "models",
              status: "pass",
              latencyMs: 1,
              summary: "Available",
            },
          ],
        })!,
    )
    const setSpy = vi.spyOn(browser.storage.local, "set")

    await verificationResultHistoryStorage.upsertLatestSummaries(batch)

    expect(setSpy).toHaveBeenCalledTimes(1)
    await expect(
      verificationResultHistoryStorage.listSummaries(),
    ).resolves.toHaveLength(3)
  })

  it("lets the last entry win within one batch", async () => {
    const target = createProfileVerificationHistoryTarget("profile-1")!
    const passing = createVerificationHistorySummary({
      target,
      apiType: API_TYPES.OPENAI,
      results: [
        { id: "models", status: "pass", latencyMs: 1, summary: "Pass" },
      ],
    })!
    const failing = createVerificationHistorySummary({
      target,
      apiType: API_TYPES.OPENAI,
      results: [
        { id: "models", status: "fail", latencyMs: 1, summary: "Fail" },
      ],
    })!

    await verificationResultHistoryStorage.upsertLatestSummaries([
      passing,
      failing,
    ])

    const stored = await verificationResultHistoryStorage.listSummaries()
    expect(stored).toHaveLength(1)
    expect(stored[0]).toEqual(failing)
  })

  it("lands a batch in the same order as sequential upserts", async () => {
    // One batch reused for both runs: rebuilding it would give the two runs
    // different `verifiedAt` values and compare unequal for the wrong reason.
    const batch = ["b-1", "b-2", "b-3"].map(
      (modelId) =>
        createVerificationHistorySummary({
          target: createProfileModelVerificationHistoryTarget(
            "profile-1",
            modelId,
          )!,
          apiType: API_TYPES.OPENAI,
          results: [
            {
              id: "models",
              status: "pass",
              latencyMs: 1,
              summary: "Available",
            },
          ],
        })!,
    )

    await verificationResultHistoryStorage.upsertLatestSummaries(batch)
    const batched = await verificationResultHistoryStorage.listSummaries()

    await verificationResultHistoryStorage.clearAllData()
    for (const summary of batch) {
      await verificationResultHistoryStorage.upsertLatestSummary(summary)
    }
    const sequential = await verificationResultHistoryStorage.listSummaries()

    expect(batched).toEqual(sequential)
  })

  it("removes every result owned by a deleted account", async () => {
    const batch = [
      createVerificationHistorySummary({
        target: createAccountModelVerificationHistoryTarget("a-gone", "m-1")!,
        apiType: API_TYPES.OPENAI,
        results: [
          { id: "models", status: "pass", latencyMs: 1, summary: "Available" },
        ],
      })!,
      createVerificationHistorySummary({
        target: createAccountModelVerificationHistoryTarget("a-live", "m-1")!,
        apiType: API_TYPES.OPENAI,
        results: [
          { id: "models", status: "pass", latencyMs: 1, summary: "Available" },
        ],
      })!,
    ]
    await verificationResultHistoryStorage.upsertLatestSummaries(batch)

    await expect(
      verificationResultHistoryStorage.reconcileOwners({
        removeAccountIds: ["a-gone"],
      }),
    ).resolves.toEqual({ removed: 1, remapped: 0 })

    await expect(
      verificationResultHistoryStorage.listSummaries(),
    ).resolves.toEqual([batch[1]])
  })

  it("removes profile-scoped and model-scoped results for a deleted profile", async () => {
    const batch = [
      createVerificationHistorySummary({
        target: createProfileVerificationHistoryTarget("p-gone")!,
        apiType: API_TYPES.OPENAI,
        results: [
          { id: "models", status: "pass", latencyMs: 1, summary: "Available" },
        ],
      })!,
      createVerificationHistorySummary({
        target: createProfileModelVerificationHistoryTarget("p-gone", "m-1")!,
        apiType: API_TYPES.OPENAI,
        results: [
          { id: "models", status: "pass", latencyMs: 1, summary: "Available" },
        ],
      })!,
      createVerificationHistorySummary({
        target: createProfileVerificationHistoryTarget("p-live")!,
        apiType: API_TYPES.OPENAI,
        results: [
          { id: "models", status: "pass", latencyMs: 1, summary: "Available" },
        ],
      })!,
    ]
    await verificationResultHistoryStorage.upsertLatestSummaries(batch)

    await expect(
      verificationResultHistoryStorage.reconcileOwners({
        removeProfileIds: ["p-gone"],
      }),
    ).resolves.toEqual({ removed: 2, remapped: 0 })

    await expect(
      verificationResultHistoryStorage.listSummaries(),
    ).resolves.toEqual([batch[2]])
  })

  it("rewrites profile-scoped results when a profile id is remapped", async () => {
    const loserTarget = createProfileVerificationHistoryTarget("p-loser")!
    const loserModelTarget = createProfileModelVerificationHistoryTarget(
      "p-loser",
      "m-1",
    )!
    const results = [
      {
        id: "models" as const,
        status: "pass" as const,
        latencyMs: 1,
        summary: "Available",
      },
    ]
    await verificationResultHistoryStorage.upsertLatestSummaries([
      createVerificationHistorySummary({
        target: loserTarget,
        apiType: API_TYPES.OPENAI,
        results,
      })!,
      createVerificationHistorySummary({
        target: loserModelTarget,
        apiType: API_TYPES.OPENAI,
        results,
      })!,
    ])

    await expect(
      verificationResultHistoryStorage.reconcileOwners({
        remapProfileIds: new Map([["p-loser", "p-winner"]]),
      }),
    ).resolves.toEqual({ removed: 0, remapped: 2 })

    await expect(
      verificationResultHistoryStorage.getLatestSummary({
        kind: "profile",
        profileId: "p-winner",
      }),
    ).resolves.toEqual(
      expect.objectContaining({ targetKey: "profile:p-winner" }),
    )
    await expect(
      verificationResultHistoryStorage.getLatestSummary({
        kind: "profile-model",
        profileId: "p-winner",
        modelId: "m-1",
      }),
    ).resolves.toEqual(
      expect.objectContaining({ targetKey: "profile:p-winner:model:m-1" }),
    )
  })

  it("does not write when a reconcile touches no stored result", async () => {
    const setSpy = vi.spyOn(browser.storage.local, "set")

    await expect(
      verificationResultHistoryStorage.reconcileOwners({
        removeProfileIds: ["p-never-stored"],
        remapProfileIds: new Map([["p-identity", "p-identity"]]),
      }),
    ).resolves.toEqual({ removed: 0, remapped: 0 })
    expect(setSpy).not.toHaveBeenCalled()
  })

  it("trusts a payload written at the current schema version", async () => {
    const storage = new Storage({ area: "local" })
    // Deliberately unsanitized: a payload this store wrote itself is read back
    // as-is instead of being re-validated on every read.
    const unsanitized = {
      target: { kind: "profile", profileId: "  p-raw  " },
      targetKey: "profile:  p-raw  ",
      status: "unsupported",
      verifiedAt: 12.6,
      apiType: API_TYPES.OPENAI,
      probes: [
        {
          id: "models",
          status: "pass",
          latencyMs: -2.4,
          summary: "  raw \n text  ",
        },
      ],
    }
    await storage.set(
      API_VERIFICATION_HISTORY_STORAGE_KEYS.VERIFICATION_RESULT_HISTORY,
      {
        version: API_VERIFICATION_RESULT_HISTORY_CONFIG_VERSION,
        summaries: [unsanitized],
        lastUpdated: Date.now(),
      },
    )

    await expect(
      verificationResultHistoryStorage.listSummaries(),
    ).resolves.toEqual([unsanitized])
  })

  it("sanitizes and upgrades a payload from the previous schema version", async () => {
    const storage = new Storage({ area: "local" })
    await storage.set(
      API_VERIFICATION_HISTORY_STORAGE_KEYS.VERIFICATION_RESULT_HISTORY,
      {
        version: API_VERIFICATION_RESULT_HISTORY_CONFIG_VERSION - 1,
        summaries: [
          {
            target: { kind: "profile", profileId: " p-legacy " },
            apiType: API_TYPES.OPENAI,
            status: "pass",
            verifiedAt: -5,
            probes: [
              {
                id: "models",
                status: "pass",
                latencyMs: 3,
                summary: "  spaced \n summary  ",
              },
            ],
          },
        ],
        lastUpdated: 0,
      },
    )

    const migrated = await verificationResultHistoryStorage.listSummaries()
    expect(migrated).toEqual([
      expect.objectContaining({
        target: { kind: "profile", profileId: "p-legacy" },
        targetKey: "profile:p-legacy",
        probes: [expect.objectContaining({ summary: "spaced summary" })],
      }),
    ])

    // The upgrade is persisted once so later reads take the trusted path.
    await expect(
      storage.get(
        API_VERIFICATION_HISTORY_STORAGE_KEYS.VERIFICATION_RESULT_HISTORY,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        version: API_VERIFICATION_RESULT_HISTORY_CONFIG_VERSION,
      }),
    )
  })

  it("reaps orphaned results and records the sweep", async () => {
    const summary = createVerificationHistorySummary({
      target: createProfileVerificationHistoryTarget("p-gone")!,
      apiType: API_TYPES.OPENAI,
      results: [
        { id: "models", status: "pass", latencyMs: 1, summary: "Available" },
      ],
    })!
    await verificationResultHistoryStorage.upsertLatestSummary(summary)

    stubLiveOwners({ profileIds: [], accountIds: [] })

    const now = Date.now() + ORPHAN_SWEEP_INTERVAL_MS
    await expect(
      verificationResultHistoryStorage.sweepOrphans({ now }),
    ).resolves.toEqual({ removed: 1, swept: true })
    await expect(
      verificationResultHistoryStorage.listSummaries(),
    ).resolves.toEqual([])
  })

  it("keeps account-scoped results when the account store cannot be read", async () => {
    const summary = createVerificationHistorySummary({
      target: createAccountModelVerificationHistoryTarget("a-any", "m-1")!,
      apiType: API_TYPES.OPENAI,
      results: [
        { id: "models", status: "pass", latencyMs: 1, summary: "Available" },
      ],
    })!
    await verificationResultHistoryStorage.upsertLatestSummary(summary)
    // The account read is left rejecting from beforeEach; make the profile read
    // resolve so a partial owner failure is the only reason anything survives.
    listProfileIdsSpy.mockResolvedValue([])

    await expect(
      verificationResultHistoryStorage.sweepOrphans({
        now: Date.now() + ORPHAN_SWEEP_INTERVAL_MS,
      }),
    ).resolves.toEqual({ removed: 0, swept: false })
    await expect(
      verificationResultHistoryStorage.listSummaries(),
    ).resolves.toEqual([summary])
  })

  it("keeps profile-scoped results when the profile store cannot be read", async () => {
    const summary = createVerificationHistorySummary({
      target: createProfileVerificationHistoryTarget("p-any")!,
      apiType: API_TYPES.OPENAI,
      results: [
        { id: "models", status: "pass", latencyMs: 1, summary: "Available" },
      ],
    })!
    await verificationResultHistoryStorage.upsertLatestSummary(summary)
    // The profile read is left rejecting from beforeEach; make the account read
    // resolve so an unreadable profile store cannot pass for "no profiles".
    readAccountsSpy.mockResolvedValue([] as any)

    await expect(
      verificationResultHistoryStorage.sweepOrphans({
        now: Date.now() + ORPHAN_SWEEP_INTERVAL_MS,
      }),
    ).resolves.toEqual({ removed: 0, swept: false })
    await expect(
      verificationResultHistoryStorage.listSummaries(),
    ).resolves.toEqual([summary])
  })

  it("sweeps when the stored payload has no sweep marker", async () => {
    const storage = new Storage({ area: "local" })
    const summary = createVerificationHistorySummary({
      target: createProfileVerificationHistoryTarget("p-gone")!,
      apiType: API_TYPES.OPENAI,
      results: [
        { id: "models", status: "pass", latencyMs: 1, summary: "Available" },
      ],
    })!
    // A payload written before the sweep marker existed must not disable sweeps.
    await storage.set(
      API_VERIFICATION_HISTORY_STORAGE_KEYS.VERIFICATION_RESULT_HISTORY,
      {
        version: API_VERIFICATION_RESULT_HISTORY_CONFIG_VERSION,
        summaries: [summary],
        lastUpdated: Date.now(),
      },
    )
    stubLiveOwners({ profileIds: [], accountIds: [] })

    await expect(
      verificationResultHistoryStorage.sweepOrphans({ now: Date.now() }),
    ).resolves.toEqual({ removed: 1, swept: true })
    await expect(
      verificationResultHistoryStorage.listSummaries(),
    ).resolves.toEqual([])
  })

  it("skips a sweep that is not due yet", async () => {
    stubLiveOwners({ profileIds: [], accountIds: [] })

    const now = Date.now()
    await expect(
      verificationResultHistoryStorage.sweepOrphans({ now }),
    ).resolves.toEqual({ removed: 0, swept: true })
    listProfileIdsSpy.mockClear()

    await expect(
      verificationResultHistoryStorage.sweepOrphans({
        now: now + ORPHAN_SWEEP_INTERVAL_MS - 1,
      }),
    ).resolves.toEqual({ removed: 0, swept: false })
    expect(listProfileIdsSpy).not.toHaveBeenCalled()
  })
})
