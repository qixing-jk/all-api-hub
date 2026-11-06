import { beforeEach, expect, it } from "vitest"

import { Storage } from "@plasmohq/storage"

import { API_VERIFICATION_HISTORY_STORAGE_KEYS } from "~/services/core/storageKeys"
import {
  CONTEXT_ATTEMPT_OUTCOMES,
  CONTEXT_CAPACITY_REASONS,
} from "~/services/verification/modelQuality/contextCapacityConstants"
import { contextCapacityHistory } from "~/services/verification/verificationResultHistory/contextCapacityHistory"
import { verificationResultHistoryStorage } from "~/services/verification/verificationResultHistory/storage"

const request = {
  baseUrl: "https://private.example/v1",
  apiKey: "private-secret-key",
  apiType: "openai-compatible" as const,
  modelId: "model",
  mode: "streaming" as const,
  requestProfile: "default" as const,
}
const result = {
  lowerBoundTokens: 4096,
  reason: CONTEXT_CAPACITY_REASONS.TestLimit,
  attempts: [
    {
      targetTokens: 4096,
      outcome: CONTEXT_ATTEMPT_OUTCOMES.Accepted,
      finishReason: "length",
      message: "private response",
    },
  ],
  counter: { encoding: "o200k_base", estimated: true },
}
beforeEach(async () => {
  await verificationResultHistoryStorage.clearAllData()
})

it("retains the tested metadata expectation across history readback", async () => {
  await contextCapacityHistory.save(request, {
    ...result,
    counter: { ...result.counter, declaredContext: 131072 },
  })
  expect(await contextCapacityHistory.get(request)).toMatchObject({
    declaredContext: 131072,
    lowerBoundTokens: 4096,
  })
})

it("migrates version 4 context history before trusting new display metadata", async () => {
  await contextCapacityHistory.save(request, result)
  const saved = await contextCapacityHistory.get(request)
  const localStore = new Storage({ area: "local" })
  const storageKey =
    API_VERIFICATION_HISTORY_STORAGE_KEYS.VERIFICATION_RESULT_HISTORY
  const config = await localStore.get<Record<string, unknown>>(storageKey)
  await localStore.set(storageKey, {
    ...config,
    version: 4,
    contextSummaries: [{ ...saved, mode: "invalid", latencyMs: -100 }],
  })
  const restored = await contextCapacityHistory.get(request)
  expect(restored?.mode).toBeUndefined()
  expect(restored?.latencyMs).toBeUndefined()
  expect(restored?.lowerBoundTokens).toBe(4096)
  expect(
    (await localStore.get<{ version: number }>(storageKey))?.version,
  ).toBeGreaterThan(4)
})

it("restores a connection summary while storing no credentials, URLs or response text", async () => {
  await contextCapacityHistory.save(request, {
    ...result,
    latencyMs: 3700,
    mode: "streaming",
  })
  expect(await contextCapacityHistory.get(request)).toMatchObject({
    lowerBoundTokens: 4096,
    outputLimited: true,
    latencyMs: 3700,
    mode: "streaming",
  })
  const raw = JSON.stringify(
    await new Storage({ area: "local" }).get(
      API_VERIFICATION_HISTORY_STORAGE_KEYS.VERIFICATION_RESULT_HISTORY,
    ),
  )
  expect(raw).not.toContain(request.apiKey)
  expect(raw).not.toContain(request.baseUrl)
  expect(raw).not.toContain("private response")
})

it.each([
  { apiKey: "changed" },
  { modelId: "other-model" },
  { mode: "non-streaming" as const },
  { requestProfileEnhanced: true },
  { requestHeaders: { "X-Route": "other" } },
])(
  "does not reuse results for a different request configuration %j",
  async (override) => {
    await contextCapacityHistory.save(request, result)
    expect(
      await contextCapacityHistory.get({ ...request, ...override }),
    ).toBeNull()
  },
)

it("preserves a request failure as a separate observation instead of capacity zero", async () => {
  await contextCapacityHistory.save(request, null)
  expect(await contextCapacityHistory.get(request)).toMatchObject({
    reason: "error",
    lowerBoundTokens: 0,
    outputLimited: false,
  })
})

it("does not let a delayed older save replace a newer observation", async () => {
  const saved = await contextCapacityHistory.save(request, result)
  await verificationResultHistoryStorage.upsertContextSummary({
    ...saved,
    verifiedAt: saved.verifiedAt - 1000,
    lowerBoundTokens: 0,
    reason: CONTEXT_CAPACITY_REASONS.Error,
  })
  expect(await contextCapacityHistory.get(request)).toMatchObject({
    lowerBoundTokens: 4096,
    reason: "test-limit",
  })
})
