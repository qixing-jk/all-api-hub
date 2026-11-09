import { beforeEach, expect, it, vi } from "vitest"

import { Storage } from "@plasmohq/storage"

import { WEB_AI_API_CHECK_STORAGE_KEYS } from "~/services/core/storageKeys"
import { CONTEXT_TOKEN_ENCODINGS } from "~/services/verification/modelQuality/contextTokenConstants"
import {
  NEEDLE_OUTCOMES,
  NEEDLE_RUN_REASONS,
} from "~/services/verification/modelQuality/needleConstants"
import { createNeedlePlan } from "~/services/verification/modelQuality/needlePlan"
import { needleHistory } from "~/services/verification/verificationResultHistory/needleHistory"
import { getVerificationScopeKey } from "~/services/verification/verificationResultHistory/requestIdentity"
import { runDurableNeedleTest } from "~/services/verification/webAiApiCheck/needleCheckpoint"
import { createNeedleResult } from "~~/tests/test-utils/needle"

const request = {
  baseUrl: "https://example.invalid",
  apiKey: "secret",
  apiType: "openai-compatible" as const,
  modelId: "test",
  seed: 123,
}
const counter = { encoding: CONTEXT_TOKEN_ENCODINGS.O200k, estimated: true }
beforeEach(() => vi.restoreAllMocks())

it("recovers an interrupted dispatched cell without issuing another provider request", async () => {
  const scope = await getVerificationScopeKey(request)
  const store = new Storage({ area: "local" })
  await store.set(WEB_AI_API_CHECK_STORAGE_KEYS.NEEDLE_CHECKPOINTS, {
    [scope]: {
      result: createNeedleResult({
        plan: createNeedlePlan({ counter }),
        counter,
        reason: NEEDLE_RUN_REASONS.Running,
        cells: [],
      }),
      inFlight: { targetTokens: 8192, depth: 10 },
    },
  })
  const fetch = vi.spyOn(globalThis, "fetch")
  const result = await runDurableNeedleTest(
    { ...request, abortSignal: new AbortController().signal },
    true,
  )
  expect(result).toMatchObject({
    reason: NEEDLE_RUN_REASONS.Interrupted,
    cells: [
      { targetTokens: 8192, depth: 10, outcome: NEEDLE_OUTCOMES.Interrupted },
    ],
  })
  expect(fetch).not.toHaveBeenCalled()
  expect((await needleHistory.get(request))?.result.reason).toBe("interrupted")
  expect(
    await store.get(WEB_AI_API_CHECK_STORAGE_KEYS.NEEDLE_CHECKPOINTS),
  ).toEqual({})
})

it("rejects continuation when its saved result belongs to another connection", async () => {
  const previous = createNeedleResult({
    plan: createNeedlePlan({ counter }),
    counter,
    reason: NEEDLE_RUN_REASONS.Stopped,
    cells: [],
  })
  await needleHistory.save(request, previous)
  const fetch = vi.spyOn(globalThis, "fetch")
  await expect(
    runDurableNeedleTest({
      ...request,
      apiKey: "different-connection",
      resumeFrom: previous,
      selection: { depth: 50 },
      abortSignal: new AbortController().signal,
    }),
  ).rejects.toThrow("different connection")
  expect(fetch).not.toHaveBeenCalled()
})

it("replaces an interrupted retest with one unknown cell and retains other measurements", async () => {
  const scope = await getVerificationScopeKey(request)
  const store = new Storage({ area: "local" })
  await store.set(WEB_AI_API_CHECK_STORAGE_KEYS.NEEDLE_CHECKPOINTS, {
    [scope]: {
      result: createNeedleResult({
        plan: createNeedlePlan({ counter }),
        counter,
        reason: NEEDLE_RUN_REASONS.Running,
        scheduled: [{ targetTokens: 8192, depth: 10 }],
        processed: 0,
        cells: [
          {
            targetTokens: 8192,
            depth: 10,
            actualDepth: 10,
            localInputTokens: 8000,
            outcome: NEEDLE_OUTCOMES.Hit,
          },
          {
            targetTokens: 8192,
            depth: 50,
            actualDepth: 50,
            localInputTokens: 8000,
            outcome: NEEDLE_OUTCOMES.Hit,
          },
        ],
      }),
      inFlight: { targetTokens: 8192, depth: 10 },
    },
  })
  const fetch = vi.spyOn(globalThis, "fetch")
  const recovered = await runDurableNeedleTest(
    { ...request, abortSignal: new AbortController().signal },
    true,
  )
  expect(recovered.cells).toHaveLength(2)
  expect(recovered.processed).toBe(1)
  expect((await needleHistory.get(request))?.result).toMatchObject({
    scheduled: [{ targetTokens: 8192, depth: 10 }],
    processed: 1,
  })
  expect(recovered.cells.map(({ depth, outcome }) => [depth, outcome])).toEqual(
    [
      [10, "interrupted"],
      [50, "hit"],
    ],
  )
  expect(fetch).not.toHaveBeenCalled()
})
