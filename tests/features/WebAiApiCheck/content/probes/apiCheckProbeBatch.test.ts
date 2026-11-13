import { beforeEach, expect, it, vi } from "vitest"

import { API_CHECK_VALIDATION_ERRORS } from "~/features/WebAiApiCheck/content/modal/apiCheckModalTypes"
import { runApiCheckProbeBatch } from "~/features/WebAiApiCheck/content/probes/apiCheckProbeBatch"
import { createApiCheckProbeSession } from "~/features/WebAiApiCheck/content/probes/apiCheckProbeSession"
import {
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_RESULTS,
} from "~/services/productAnalytics/contracts"
import {
  API_TYPES,
  API_VERIFICATION_MODES,
  API_VERIFICATION_PROBE_IDS,
  API_VERIFICATION_PROBE_STATUSES,
  type ApiVerificationProbeResult,
} from "~/services/verification/aiApiVerification"
import { createDeferred } from "~~/tests/test-utils/deferred"

const complete = vi.hoisted(() => vi.fn())
vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: () => ({ complete }),
}))
beforeEach(() => vi.clearAllMocks())

function options() {
  return {
    apiType: API_TYPES.OPENAI_COMPATIBLE,
    verificationMode: API_VERIFICATION_MODES.Streaming,
    trigger: "contextMenu" as const,
    baseUrl: " https://example.invalid ",
    apiKey: " secret ",
    modelId: "test",
    probeDefinitions: [
      { id: API_VERIFICATION_PROBE_IDS.Models, requiresModelId: false },
      { id: API_VERIFICATION_PROBE_IDS.TextGeneration, requiresModelId: true },
    ],
    concurrency: 1,
    session: createApiCheckProbeSession({
      cancelRun: vi.fn().mockResolvedValue(undefined),
    }),
    runProbe: vi
      .fn()
      .mockImplementation(async (id): Promise<ApiVerificationProbeResult> => ({
        id,
        status: API_VERIFICATION_PROBE_STATUSES.Pass,
        latencyMs: 0,
        summary: "passed",
      })),
    setValidationError: vi.fn(),
    recordBaseUrlHistory: vi.fn(),
    recordMissingModel: vi.fn(),
    onStart: vi.fn(),
    onStopped: vi.fn(),
    onFinish: vi.fn(),
  }
}

it("skips an invalid batch without admitting work or changing running state", async () => {
  const input = { ...options(), apiKey: " " }
  await runApiCheckProbeBatch(input)
  expect(input.setValidationError).toHaveBeenCalledWith(
    API_CHECK_VALIDATION_ERRORS.MissingCredentials,
  )
  expect(input.runProbe).not.toHaveBeenCalled()
  expect(input.onStart).not.toHaveBeenCalled()
  expect(input.onFinish).not.toHaveBeenCalled()
  expect(input.recordBaseUrlHistory).not.toHaveBeenCalled()
  expect(complete).toHaveBeenCalledWith(
    PRODUCT_ANALYTICS_RESULTS.Skipped,
    expect.objectContaining({
      insights: expect.objectContaining({ itemCount: 2, skippedCount: 2 }),
    }),
  )
})

it("records missing-model failures while still running model discovery and saving history once", async () => {
  const input = { ...options(), modelId: " " }
  await runApiCheckProbeBatch(input)
  expect(input.runProbe).toHaveBeenCalledOnce()
  expect(input.runProbe).toHaveBeenCalledWith(
    API_VERIFICATION_PROBE_IDS.Models,
    expect.objectContaining({ recordHistory: false, trackIndividual: false }),
  )
  expect(input.recordBaseUrlHistory).toHaveBeenCalledExactlyOnceWith(
    "https://example.invalid",
  )
  expect(input.recordMissingModel).toHaveBeenCalledWith(
    API_VERIFICATION_PROBE_IDS.TextGeneration,
    expect.objectContaining({ status: API_VERIFICATION_PROBE_STATUSES.Fail }),
  )
  expect(complete).toHaveBeenCalledWith(
    PRODUCT_ANALYTICS_RESULTS.Failure,
    expect.objectContaining({
      errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
      insights: expect.objectContaining({
        successCount: 1,
        failureCount: 1,
        skippedCount: 0,
      }),
    }),
  )
  expect(input.onFinish).toHaveBeenCalledOnce()
})

it("keeps late completion from a reset batch from clearing a newer batch's state", async () => {
  const input = options()
  const pending = createDeferred<ApiVerificationProbeResult>()
  input.runProbe.mockReturnValueOnce(pending.promise)
  const run = runApiCheckProbeBatch(input)
  input.session.reset()
  const newer = input.session.beginBatch()
  pending.resolve({
    id: API_VERIFICATION_PROBE_IDS.Models,
    status: API_VERIFICATION_PROBE_STATUSES.Pass,
    latencyMs: 0,
    summary: "late",
  })
  await run
  expect(input.runProbe).toHaveBeenCalledOnce()
  expect(input.onStopped).not.toHaveBeenCalled()
  expect(input.onFinish).not.toHaveBeenCalled()
  expect(newer.isCurrent()).toBe(true)
  expect(complete).toHaveBeenCalledWith(
    PRODUCT_ANALYTICS_RESULTS.Cancelled,
    expect.objectContaining({
      insights: expect.objectContaining({ successCount: 0, skippedCount: 2 }),
    }),
  )
})
