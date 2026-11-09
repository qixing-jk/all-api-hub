import { beforeEach, expect, it } from "vitest"

import { CONTEXT_TOKEN_ENCODINGS } from "~/services/verification/modelQuality/contextTokenConstants"
import {
  NEEDLE_OUTCOMES,
  NEEDLE_RUN_REASONS,
} from "~/services/verification/modelQuality/needleConstants"
import { createNeedlePlan } from "~/services/verification/modelQuality/needlePlan"
import { needleHistory } from "~/services/verification/verificationResultHistory/needleHistory"
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
