import { describe, expect, it, vi } from "vitest"

import { createProfileSource } from "~/features/ModelList/catalog/modelManagementSources"
import { MODEL_LIST_BATCH_VERIFY_API_TYPE_MODES } from "~/features/ModelList/verification/batchVerification"
import { executeBatchModelVerification } from "~/features/ModelList/verification/executeBatchModelVerification"
import {
  API_TYPES,
  API_VERIFICATION_MODES,
  API_VERIFICATION_PROBE_IDS,
} from "~/services/verification/aiApiVerification"

const { mockLoggerError, mockRunApiVerificationProbe } = vi.hoisted(() => ({
  mockLoggerError: vi.fn(),
  mockRunApiVerificationProbe: vi.fn(),
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: () => ({
    error: mockLoggerError,
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}))

vi.mock("~/services/verification/aiApiVerification", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/verification/aiApiVerification")
    >()
  return {
    ...actual,
    runApiVerificationProbe: (...args: any[]) =>
      mockRunApiVerificationProbe(...args),
  }
})

describe("executeBatchModelVerification", () => {
  it("logs an error and continues when persistResult rejects", async () => {
    mockRunApiVerificationProbe.mockResolvedValueOnce({
      id: API_VERIFICATION_PROBE_IDS.Models,
      status: "pass",
      latencyMs: 10,
      summary: "Models found",
    })

    const profileSource = createProfileSource({
      id: "profile-1",
      name: "Profile",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://example.com/v1",
      apiKey: "sk-test",
      tagIds: [],
      notes: "",
      createdAt: 1,
      updatedAt: 1,
    })

    const item = {
      key: "profile:profile-1:gpt-4o",
      modelId: "gpt-4o",
      enableGroups: null,
      source: profileSource,
    }

    const publish = vi.fn()
    const persistResult = vi
      .fn()
      .mockRejectedValue(new Error("Storage full error"))

    const status = await executeBatchModelVerification(item, {
      apiTypeMode: MODEL_LIST_BATCH_VERIFY_API_TYPE_MODES.AUTO,
      verificationMode: API_VERIFICATION_MODES.Streaming,
      selectedProbeIds: [API_VERIFICATION_PROBE_IDS.Models],
      abortSignal: new AbortController().signal,
      shouldStop: () => false,
      getAccountRuntimeKeys: vi.fn(),
      getResolvedRuntimeKey: vi.fn(),
      persistResult,
      recordFailureCategory: vi.fn(),
      publish,
    })

    expect(status).toBe("pass")
    expect(mockLoggerError).toHaveBeenCalledWith(
      "Failed to persist batch verification result",
      expect.objectContaining({
        modelId: "gpt-4o",
        error: expect.any(Error),
      }),
    )
  })
})
