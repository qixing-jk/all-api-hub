import { beforeEach, expect, it, vi } from "vitest"

import { Storage } from "@plasmohq/storage"

import { WEB_AI_API_CHECK_STORAGE_KEYS } from "~/services/core/storageKeys"
import { runContextCapacity } from "~/services/verification/modelQuality/contextCapacityRun"
import { runDurableContextCapacity } from "~/services/verification/webAiApiCheck/contextCapacityCheckpoint"
import { createDeferred } from "~~/tests/test-utils/deferred"

vi.mock("~/services/verification/modelQuality/contextCapacityRun", () => ({
  runContextCapacity: vi.fn(),
}))
const request = {
  apiType: "openai" as const,
  baseUrl: "https://example.invalid",
  apiKey: "test",
  modelId: "test",
  abortSignal: new AbortController().signal,
}
const result = {
  lowerBoundTokens: 1024,
  reason: "test-limit" as const,
  attempts: [{ targetTokens: 1024, outcome: "accepted" as const }],
  inputLimit: 8192,
  counter: { encoding: "o200k_base", estimated: true },
}
const storage = new Storage({ area: "local" })
beforeEach(async () => {
  vi.mocked(runContextCapacity).mockReset()
  await storage.remove(WEB_AI_API_CHECK_STORAGE_KEYS.CONTEXT_CHECKPOINTS)
})

it("refuses another run on the same connection while a provider request is pending", async () => {
  const pending = createDeferred<typeof result>()
  vi.mocked(runContextCapacity).mockReturnValue(pending.promise)
  const first = runDurableContextCapacity(request)
  await vi.waitFor(() => expect(runContextCapacity).toHaveBeenCalledOnce())
  try {
    await expect(runDurableContextCapacity(request)).rejects.toThrow(
      "already has a context test running",
    )
  } finally {
    pending.resolve(result)
    await first
  }
  expect(runContextCapacity).toHaveBeenCalledOnce()
})

it("stops before provider dispatch when unresolved checkpoint storage is full", async () => {
  await storage.set(
    WEB_AI_API_CHECK_STORAGE_KEYS.CONTEXT_CHECKPOINTS,
    Object.fromEntries(
      Array.from({ length: 20 }, (_, index) => [
        String(index),
        { result, inFlightTarget: 2048 },
      ]),
    ),
  )
  const provider = vi.fn()
  vi.mocked(runContextCapacity).mockImplementation(async (params) => {
    await params.onCheckpoint?.({ result, inFlightTarget: 2048 })
    provider()
    return result
  })
  await expect(runDurableContextCapacity(request)).rejects.toThrow(
    "Too many interrupted context tests",
  )
  expect(provider).not.toHaveBeenCalled()
  expect(
    Object.keys(
      (await storage.get<Record<string, unknown>>(
        WEB_AI_API_CHECK_STORAGE_KEYS.CONTEXT_CHECKPOINTS,
      ))!,
    ),
  ).toHaveLength(20)
})

it("preserves the in-flight checkpoint and earlier history when a request is cancelled", async () => {
  const controller = new AbortController()
  vi.mocked(runContextCapacity).mockImplementationOnce(async (params) => {
    await params.onCheckpoint?.({ result, inFlightTarget: 2048 })
    controller.abort()
    await params.onCheckpoint?.({ result: { ...result, reason: "stopped" } })
    return { ...result, reason: "stopped" }
  })
  await runDurableContextCapacity({
    ...request,
    abortSignal: controller.signal,
  })
  vi.mocked(runContextCapacity).mockClear()
  const recovered = await runDurableContextCapacity(request, true)
  expect(recovered.reason).toBe("inconclusive")
  expect(recovered.attempts.at(-1)).toMatchObject({
    targetTokens: 2048,
    failureReason: "interrupted",
  })
  expect(runContextCapacity).not.toHaveBeenCalled()
})

it("discards abandoned checkpoints while preserving active provider requests", async () => {
  const checkpoints = await import(
    "~/services/verification/webAiApiCheck/contextCapacityCheckpoint"
  )
  const ready = createDeferred<void>()
  const pending = createDeferred<typeof result>()
  await storage.set(WEB_AI_API_CHECK_STORAGE_KEYS.CONTEXT_CHECKPOINTS, {
    abandoned: { result, inFlightTarget: 2048 },
  })
  vi.mocked(runContextCapacity).mockImplementationOnce(async (params) => {
    await params.onCheckpoint?.({ result, inFlightTarget: 2048 })
    ready.resolve()
    return pending.promise
  })
  const active = runDurableContextCapacity(request)
  await ready.promise
  try {
    expect(await checkpoints.discardInactiveContextCheckpoints()).toBe(1)
    const remaining = await storage.get<Record<string, unknown>>(
      WEB_AI_API_CHECK_STORAGE_KEYS.CONTEXT_CHECKPOINTS,
    )
    expect(Object.keys(remaining!)).toHaveLength(1)
    expect(remaining).not.toHaveProperty("abandoned")
    expect(await checkpoints.discardInactiveContextCheckpoints()).toBe(0)
  } finally {
    pending.resolve(result)
    await active
  }
})

it("recovers a completed terminal checkpoint without asking for another paid confirmation", async () => {
  const complete = { ...result, inputLimit: 1024 }
  vi.mocked(runContextCapacity).mockImplementationOnce(async (params) => {
    await params.onCheckpoint?.({ result: complete })
    throw new Error("worker stopped after completion")
  })
  await expect(runDurableContextCapacity(request)).rejects.toThrow(
    "worker stopped",
  )
  expect(await runDurableContextCapacity(request, true)).toMatchObject({
    reason: "test-limit",
    lowerBoundTokens: 1024,
  })
  expect(runContextCapacity).toHaveBeenCalledOnce()
})
