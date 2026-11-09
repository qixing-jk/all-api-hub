import { beforeEach, expect, it, vi } from "vitest"

import { CONTEXT_TOKEN_ENCODINGS } from "~/services/verification/modelQuality/contextTokenConstants"
import {
  NEEDLE_OUTCOMES,
  NEEDLE_RUN_REASONS,
} from "~/services/verification/modelQuality/needleConstants"
import { createNeedlePlan } from "~/services/verification/modelQuality/needlePlan"
import {
  coerceNeedleSummary,
  sanitizeConfig,
} from "~/services/verification/verificationResultHistory/codec"
import { needleHistory } from "~/services/verification/verificationResultHistory/needleHistory"
import { VERIFICATION_SUMMARY_MAX_AGE_MS } from "~/services/verification/verificationResultHistory/retention"
import { verificationResultHistoryStorage } from "~/services/verification/verificationResultHistory/storage"
import { createNeedleResult } from "~~/tests/test-utils/needle"

const request = {
  baseUrl: "https://example.invalid",
  apiKey: "private-key",
  apiType: "openai-compatible" as const,
  modelId: "test",
}
const counter = { encoding: CONTEXT_TOKEN_ENCODINGS.O200k, estimated: true }
const result = createNeedleResult({
  counter,
  plan: createNeedlePlan({ counter }),
  reason: NEEDLE_RUN_REASONS.Complete,
  cells: [
    {
      targetTokens: 8192,
      depth: 10,
      actualDepth: 10,
      localInputTokens: 8190,
      outcome: NEEDLE_OUTCOMES.Hit,
      response: "private-answer",
      expected: "private-answer",
    },
  ],
})

beforeEach(async () => {
  await verificationResultHistoryStorage.clearAllData()
})

it("restores bounded retrieval facts only for the same request identity", async () => {
  await needleHistory.save(request, result)
  const saved = await needleHistory.get(request)
  expect(saved?.result).toMatchObject({
    seed: 123,
    cells: [{ outcome: NEEDLE_OUTCOMES.Hit }],
  })
  expect(JSON.stringify(saved)).not.toContain("private")
  expect(
    await needleHistory.get({ ...request, apiKey: "different" }),
  ).toBeNull()
})

it("clears retrieval history with its model owner", async () => {
  const target = {
    kind: "profile-model" as const,
    profileId: "profile",
    modelId: "test",
  }
  await needleHistory.save(request, result, target)
  await verificationResultHistoryStorage.clearTarget(target)
  expect(await needleHistory.get(request, target)).toBeNull()
})

it("retains the selected scope and its progress without persisting live preparation", async () => {
  const scoped = {
    ...result,
    scheduled: [{ targetTokens: 8192, depth: 10 }],
    processed: 1,
    preparing: { targetTokens: 8192, depth: 10 },
  }
  await needleHistory.save(request, scoped)
  const saved = await needleHistory.get(request)
  expect(saved?.result.scheduled).toEqual([{ targetTokens: 8192, depth: 10 }])
  expect(saved?.result.processed).toBe(1)
  expect(saved?.result.preparing).toBeUndefined()
})

it("keeps the newest measurement when an older write arrives later", async () => {
  await needleHistory.save(request, result)
  const saved = (await needleHistory.get(request))!
  await verificationResultHistoryStorage.upsertNeedleSummary({
    ...saved,
    verifiedAt: saved.verifiedAt - 1,
    result: { ...result, seed: 999 },
  })
  expect((await needleHistory.get(request))?.result.seed).toBe(123)
})

it.each([
  null,
  { scopeKey: "invalid", result },
  { scopeKey: "a".repeat(64), result, target: { kind: "unknown" } },
  {
    scopeKey: "a".repeat(64),
    result: { ...result, cancelled: [{ targetTokens: 8192, depth: 10 }] },
  },
  {
    scopeKey: "a".repeat(64),
    result: {
      ...result,
      scheduled: [{ targetTokens: 8192, depth: 10 }],
      cancelled: [{ targetTokens: 8192, depth: 90 }],
    },
  },
  {
    scopeKey: "a".repeat(64),
    result: {
      ...result,
      scheduled: [{ targetTokens: 8192, depth: 10 }],
      cancelled: [
        { targetTokens: 8192, depth: 10 },
        { targetTokens: 8192, depth: 10 },
      ],
    },
  },
])("rejects malformed retrieval history %#", async (summary) => {
  expect(coerceNeedleSummary(summary)).toBeNull()
  await expect(
    verificationResultHistoryStorage.upsertNeedleSummary(summary as never),
  ).rejects.toThrow("Invalid needle summary")
  expect(await needleHistory.get(request)).toBeNull()
})

it("filters invalid imported needle summaries while preserving valid measurements", async () => {
  await needleHistory.save(request, result)
  const saved = (await needleHistory.get(request))!
  const config = sanitizeConfig({
    version: 1,
    summaries: [],
    needleSummaries: [null, saved, { result: {} }],
  })
  expect(config.needleSummaries).toEqual([saved])
})

it("expires anonymous retrieval results without requiring an owner sweep", async () => {
  await needleHistory.save(request, result)
  const now = vi
    .spyOn(Date, "now")
    .mockReturnValue(Date.now() + VERIFICATION_SUMMARY_MAX_AGE_MS + 1)
  try {
    expect(await needleHistory.get(request)).toBeNull()
  } finally {
    now.mockRestore()
  }
})

it("preserves other model results when clearing or remapping an owner", async () => {
  const first = {
    kind: "profile-model" as const,
    profileId: "first",
    modelId: "test",
  }
  const second = { ...first, profileId: "second" }
  await needleHistory.save(request, result, first)
  await needleHistory.save(request, { ...result, seed: 456 }, second)
  await verificationResultHistoryStorage.clearTarget(first)
  expect(await needleHistory.get(request, first)).toBeNull()
  expect((await needleHistory.get(request, second))?.result.seed).toBe(456)
  const outcome = await verificationResultHistoryStorage.reconcileOwners({
    remapProfileIds: new Map([["second", "renamed"]]),
  })
  expect(outcome).toMatchObject({ remapped: 1, removed: 0 })
  expect(await needleHistory.get(request, second)).toBeNull()
  expect(
    (await needleHistory.get(request, { ...second, profileId: "renamed" }))
      ?.result.seed,
  ).toBe(456)
})

it.each([
  [
    "google",
    "https://example.invalid/v1beta/gemini/v1beta/models/gemini-test:generateContent",
    "https://example.invalid/v1beta/gemini",
  ],
  [
    "openai-compatible",
    "https://example.invalid/v1/proxy/v1/chat/completions",
    "https://example.invalid/v1/proxy",
  ],
] as const)(
  "shares %s retrieval history across endpoint and base URL forms",
  async (apiType, endpoint, baseUrl) => {
    await needleHistory.save({ ...request, apiType, baseUrl: endpoint }, result)
    expect(
      (await needleHistory.get({ ...request, apiType, baseUrl }))?.result.seed,
    ).toBe(123)
  },
)
