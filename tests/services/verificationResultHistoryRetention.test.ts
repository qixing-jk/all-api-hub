import { describe, expect, it } from "vitest"

import {
  applyOwnerReconcile,
  applyVerificationRetention,
  VERIFICATION_SUMMARY_MAX_AGE_MS,
} from "~/services/verification/verificationResultHistory/retention"
import {
  API_VERIFICATION_HISTORY_TARGET_KINDS,
  type ApiVerificationHistorySummary,
} from "~/services/verification/verificationResultHistory/types"
import { serializeVerificationHistoryTarget } from "~/services/verification/verificationResultHistory/utils"

const NOW = 1_800_000_000_000

function profileSummary(
  profileId: string,
  verifiedAt: number,
): ApiVerificationHistorySummary {
  return buildSummary(
    {
      kind: API_VERIFICATION_HISTORY_TARGET_KINDS.Profile,
      profileId,
    },
    verifiedAt,
  )
}

function profileModelSummary(
  profileId: string,
  modelId: string,
  verifiedAt: number,
): ApiVerificationHistorySummary {
  return buildSummary(
    {
      kind: API_VERIFICATION_HISTORY_TARGET_KINDS.ProfileModel,
      profileId,
      modelId,
    },
    verifiedAt,
  )
}

function accountModelSummary(
  accountId: string,
  modelId: string,
  verifiedAt: number,
): ApiVerificationHistorySummary {
  return buildSummary(
    {
      kind: API_VERIFICATION_HISTORY_TARGET_KINDS.AccountModel,
      accountId,
      modelId,
    },
    verifiedAt,
  )
}

function buildSummary(
  target: ApiVerificationHistorySummary["target"],
  verifiedAt: number,
): ApiVerificationHistorySummary {
  return {
    target,
    targetKey: serializeVerificationHistoryTarget(target),
    status: "pass",
    verifiedAt,
    apiType: "openai-compatible",
    probes: [
      { id: "models", status: "pass", latencyMs: 1, summary: "Available" },
    ],
  }
}

describe("applyVerificationRetention", () => {
  it("drops summaries older than the maximum age and keeps fresher ones", () => {
    const expired = profileSummary(
      "p-old",
      NOW - VERIFICATION_SUMMARY_MAX_AGE_MS - 1,
    )
    const fresh = profileSummary(
      "p-new",
      NOW - VERIFICATION_SUMMARY_MAX_AGE_MS + 1,
    )

    const result = applyVerificationRetention([expired, fresh], { now: NOW })

    expect(result.summaries.map(({ targetKey }) => targetKey)).toEqual([
      "profile:p-new",
    ])
    expect(result.changed).toBe(true)
  })

  it("keeps a summary verified exactly at the age cutoff", () => {
    const boundary = profileSummary(
      "p-boundary",
      NOW - VERIFICATION_SUMMARY_MAX_AGE_MS,
    )

    const result = applyVerificationRetention([boundary], { now: NOW })

    expect(result.summaries).toHaveLength(1)
    expect(result.changed).toBe(false)
  })

  it("drops summaries whose profile owner no longer exists", () => {
    const orphan = profileSummary("p-gone", NOW)
    const orphanModel = profileModelSummary("p-gone", "gpt-4.1", NOW)
    const kept = profileSummary("p-live", NOW)

    const result = applyVerificationRetention([orphan, orphanModel, kept], {
      now: NOW,
      liveProfileIds: new Set(["p-live"]),
    })

    expect(result.summaries.map(({ targetKey }) => targetKey)).toEqual([
      "profile:p-live",
    ])
    expect(result.changed).toBe(true)
  })

  it("drops summaries whose account owner no longer exists", () => {
    const orphan = accountModelSummary("a-gone", "gpt-4.1", NOW)
    const kept = accountModelSummary("a-live", "gpt-4.1", NOW)

    const result = applyVerificationRetention([orphan, kept], {
      now: NOW,
      liveAccountIds: new Set(["a-live"]),
    })

    expect(result.summaries.map(({ targetKey }) => targetKey)).toEqual([
      "account:a-live:model:gpt-4.1",
    ])
  })

  it("skips profile ownership checks when the live profile ids are unavailable", () => {
    const summaries = [
      profileSummary("p-any", NOW),
      profileModelSummary("p-any", "gpt-4.1", NOW),
    ]

    const result = applyVerificationRetention(summaries, { now: NOW })

    expect(result.summaries).toHaveLength(2)
    expect(result.changed).toBe(false)
  })

  it("skips account ownership checks when the live account ids are unavailable", () => {
    const result = applyVerificationRetention(
      [accountModelSummary("a-any", "gpt-4.1", NOW)],
      { now: NOW },
    )

    expect(result.summaries).toHaveLength(1)
    expect(result.changed).toBe(false)
  })

  it("reports no change when every summary survives", () => {
    const summaries = [
      profileSummary("p-1", NOW),
      accountModelSummary("a-1", "m", NOW),
    ]

    const result = applyVerificationRetention(summaries, {
      now: NOW,
      liveProfileIds: new Set(["p-1"]),
      liveAccountIds: new Set(["a-1"]),
    })

    expect(result.summaries).toEqual(summaries)
    expect(result.changed).toBe(false)
  })

  it("checks profile and account ownership independently in one pass", () => {
    const result = applyVerificationRetention(
      [
        profileSummary("p-gone", NOW),
        accountModelSummary("a-gone", "m", NOW),
        profileSummary("p-live", NOW),
        accountModelSummary("a-live", "m", NOW),
      ],
      {
        now: NOW,
        liveProfileIds: new Set(["p-live"]),
        liveAccountIds: new Set(["a-live"]),
      },
    )

    expect(result.summaries.map(({ targetKey }) => targetKey)).toEqual([
      "profile:p-live",
      "account:a-live:model:m",
    ])
  })
})

describe("applyOwnerReconcile", () => {
  it("removes every result owned by a removed account", () => {
    const result = applyOwnerReconcile(
      [
        accountModelSummary("a-gone", "m-1", NOW),
        accountModelSummary("a-gone", "m-2", NOW),
        accountModelSummary("a-live", "m-1", NOW),
      ],
      { removeAccountIds: new Set(["a-gone"]) },
    )

    expect(result.summaries.map(({ targetKey }) => targetKey)).toEqual([
      "account:a-live:model:m-1",
    ])
    expect(result.removed).toBe(2)
    expect(result.remapped).toBe(0)
  })

  it("removes both profile-scoped and profile-model-scoped results for a removed profile", () => {
    const result = applyOwnerReconcile(
      [
        profileSummary("p-gone", NOW),
        profileModelSummary("p-gone", "m-1", NOW),
        profileSummary("p-live", NOW),
        accountModelSummary("p-gone", "m-1", NOW),
      ],
      { removeProfileIds: new Set(["p-gone"]) },
    )

    // An account-model target is owned by its account, not by a profile id that
    // happens to share the string.
    expect(result.summaries.map(({ targetKey }) => targetKey)).toEqual([
      "profile:p-live",
      "account:p-gone:model:m-1",
    ])
    expect(result.removed).toBe(2)
  })

  it("rewrites profile-scoped targets and their keys when profile ids are remapped", () => {
    const result = applyOwnerReconcile(
      [
        profileSummary("p-loser", NOW),
        profileModelSummary("p-loser", "m-1", NOW),
      ],
      { remapProfileIds: new Map([["p-loser", "p-winner"]]) },
    )

    expect(result.summaries).toEqual([
      expect.objectContaining({
        targetKey: "profile:p-winner",
        target: { kind: "profile", profileId: "p-winner" },
      }),
      expect.objectContaining({
        targetKey: "profile:p-winner:model:m-1",
        target: {
          kind: "profile-model",
          profileId: "p-winner",
          modelId: "m-1",
        },
      }),
    ])
    expect(result.remapped).toBe(2)
    expect(result.removed).toBe(0)
  })

  it("leaves account-scoped targets untouched by a profile id remap", () => {
    const summary = accountModelSummary("p-loser", "m-1", NOW)

    const result = applyOwnerReconcile([summary], {
      remapProfileIds: new Map([["p-loser", "p-winner"]]),
    })

    expect(result.summaries[0]).toBe(summary)
    expect(result.remapped).toBe(0)
    expect(result.removed).toBe(0)
  })

  it("treats identity remap entries as no change", () => {
    const summaries = [profileSummary("p-1", NOW)]

    const result = applyOwnerReconcile(summaries, {
      remapProfileIds: new Map([["p-1", "p-1"]]),
    })

    expect(result.summaries).toBe(summaries)
    expect(result.remapped).toBe(0)
    expect(result.removed).toBe(0)
  })

  it("keeps the newer result when a remap collides on one target key", () => {
    const older = profileSummary("p-loser", NOW - 10)
    const newer = profileSummary("p-winner", NOW)

    const result = applyOwnerReconcile([older, newer], {
      remapProfileIds: new Map([["p-loser", "p-winner"]]),
    })

    expect(result.summaries).toHaveLength(1)
    expect(result.summaries[0]!.verifiedAt).toBe(NOW)
    expect(result.removed).toBe(1)
    expect(result.remapped).toBe(1)
  })

  it("removes the winner's own results before remapping twins onto it", () => {
    // A credential edit on the surviving profile invalidates its own stale
    // results, while a twin merged into it was tested with the new credentials.
    const staleWinnerResult = profileModelSummary("p-winner", "m-1", NOW - 5)
    const validLoserResult = profileModelSummary("p-loser", "m-1", NOW)

    const result = applyOwnerReconcile([staleWinnerResult, validLoserResult], {
      removeProfileIds: new Set(["p-winner"]),
      remapProfileIds: new Map([["p-loser", "p-winner"]]),
    })

    expect(result.summaries).toHaveLength(1)
    expect(result.summaries[0]).toEqual(
      expect.objectContaining({
        targetKey: "profile:p-winner:model:m-1",
        verifiedAt: NOW,
      }),
    )
    expect(result.removed).toBe(1)
    expect(result.remapped).toBe(1)
  })

  it("reports no change for an empty reconcile", () => {
    const summaries = [profileSummary("p-1", NOW)]

    const result = applyOwnerReconcile(summaries, {})

    expect(result.summaries).toBe(summaries)
    expect(result.removed).toBe(0)
    expect(result.remapped).toBe(0)
  })
})
