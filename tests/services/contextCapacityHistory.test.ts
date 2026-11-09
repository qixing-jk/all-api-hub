import { beforeEach, expect, it, vi } from "vitest"

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

it.each([{}, "invalid", 1])(
  "ignores corrupt current-version context collections: %j",
  async (contextSummaries) => {
    await contextCapacityHistory.save(request, result)
    const store = new Storage({ area: "local" })
    const key =
      API_VERIFICATION_HISTORY_STORAGE_KEYS.VERIFICATION_RESULT_HISTORY
    const config = await store.get<Record<string, unknown>>(key)
    await store.set(key, { ...config, contextSummaries })
    expect(await contextCapacityHistory.get(request)).toBeNull()
    await expect(
      contextCapacityHistory.save(request, result),
    ).resolves.toMatchObject({ lowerBoundTokens: 4096 })
  },
)

it("rejects non-string reasons in current-version history", async () => {
  const saved = await contextCapacityHistory.save(request, result)
  const store = new Storage({ area: "local" })
  const key = API_VERIFICATION_HISTORY_STORAGE_KEYS.VERIFICATION_RESULT_HISTORY
  const config = await store.get<Record<string, unknown>>(key)
  await store.set(key, {
    ...config,
    contextSummaries: [{ ...saved, reason: ["test-limit"] }],
  })
  expect(await contextCapacityHistory.get(request)).toBeNull()
})

it("retains the tested metadata expectation across history readback", async () => {
  await contextCapacityHistory.save(request, {
    ...result,
    counter: { ...result.counter, declaredContext: 131072 },
  })
  expect(await contextCapacityHistory.get(request)).toMatchObject({
    declaredContext: 131072,
    lowerBoundTokens: 4096,
    counter: { encoding: "o200k_base", estimated: true },
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

it("timestamps an observation before asynchronous identity hashing", async () => {
  const digest = crypto.subtle.digest.bind(crypto.subtle)
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const spy = vi
    .spyOn(crypto.subtle, "digest")
    .mockImplementationOnce(async (...args) => {
      await gate
      return digest(...args)
    })
  const clock = vi.spyOn(Date, "now").mockReturnValue(1000)
  try {
    const older = contextCapacityHistory.save(request, {
      ...result,
      lowerBoundTokens: 1024,
    })
    clock.mockReturnValue(2000)
    await contextCapacityHistory.save(request, result)
    clock.mockReturnValue(3000)
    release()
    await older
    expect(await contextCapacityHistory.get(request)).toMatchObject({
      lowerBoundTokens: 4096,
      verifiedAt: 2000,
    })
  } finally {
    release()
    spy.mockRestore()
    clock.mockRestore()
  }
})

it.each([
  { failureReason: "timeout" as const, expected: "timeout" },
  { finishReason: "stop", expected: "empty-response" },
])(
  "preserves completed inconclusive feedback: $expected",
  async ({ expected, ...attempt }) => {
    await contextCapacityHistory.save(request, {
      ...result,
      reason: "inconclusive",
      lowerBoundTokens: 0,
      attempts: [{ targetTokens: 4096, outcome: "inconclusive", ...attempt }],
    })
    expect(await contextCapacityHistory.get(request)).toMatchObject({
      inconclusiveReason: expected,
    })
  },
)

it.each([
  { scopeKey: "invalid" },
  { apiType: "invalid" },
  { reason: ["test-limit"] },
  { requests: -1 },
  { lowerBoundTokens: -1 },
  { upperBoundTokens: -1 },
  { target: { kind: "invalid" } },
])(
  "rejects invalid summary facts at the storage boundary: %j",
  async (override) => {
    const saved = await contextCapacityHistory.save(request, result)
    await expect(
      verificationResultHistoryStorage.upsertContextSummary({
        ...saved,
        ...override,
      } as any),
    ).rejects.toThrow("Invalid context capacity summary")
  },
)
it("keeps a connection observation when an unrelated owner is removed", async () => {
  await contextCapacityHistory.save(request, result)
  await verificationResultHistoryStorage.reconcileOwners({
    removeAccountIds: ["other"],
    removeProfileIds: ["other"],
  })
  expect(await contextCapacityHistory.get(request)).toMatchObject({
    lowerBoundTokens: 4096,
  })
})

it("persists the rejection bound under the actual model of a profile-level target", async () => {
  const { apiCredentialProfilesStorage } = await import(
    "~/services/apiCredentialProfiles/storage/profiles"
  )
  const profile = await apiCredentialProfilesStorage.createProfile({
    name: "Context history test",
    apiType: request.apiType,
    baseUrl: request.baseUrl,
    apiKey: request.apiKey,
  })
  try {
    const target = { kind: "profile" as const, profileId: profile.id }
    await contextCapacityHistory.save(
      request,
      { ...result, reason: "bracketed", upperBoundTokens: 8192 },
      target,
    )
    expect(await contextCapacityHistory.get(request, target)).toMatchObject({
      upperBoundTokens: 8192,
      target: {
        kind: "profile-model",
        profileId: profile.id,
        modelId: request.modelId,
      },
    })
  } finally {
    await apiCredentialProfilesStorage.deleteProfile(profile.id)
  }
})
it.each([null, "invalid"])(
  "rejects a non-object stored capacity summary: %j",
  async (value) => {
    await expect(
      verificationResultHistoryStorage.upsertContextSummary(value as never),
    ).rejects.toThrow("Invalid context capacity summary")
  },
)

it("restores inventory-bound account history as unverified without persisting the inventory identity", async () => {
  const { stubVerificationOwnerStoresUnavailable } = await import(
    "~~/tests/test-utils/verificationOwnerStores"
  )
  const { getAccountInventoryContextHistory } = await import(
    "~/services/verification/verificationResultHistory/contextCapacityHistory"
  )
  stubVerificationOwnerStoresUnavailable()
  const target = {
    kind: "account-model" as const,
    accountId: "inventory-history",
    modelId: request.modelId,
  }
  const identity = "private inventory identity"
  try {
    await contextCapacityHistory.save(request, result, target, identity)
    expect(
      await getAccountInventoryContextHistory(target, identity),
    ).toMatchObject({
      lowerBoundTokens: 4096,
      requiresCredentialVerification: true,
    })
    expect(
      await getAccountInventoryContextHistory(
        target,
        identity + " changed mask or endpoint",
      ),
    ).toBeNull()
    expect(
      await getAccountInventoryContextHistory(
        { ...target, accountId: "another" },
        identity,
      ),
    ).toBeNull()
    expect(
      await contextCapacityHistory.get(
        { ...request, apiKey: "rotated" },
        target,
      ),
    ).toBeNull()
    const raw = JSON.stringify(
      await new Storage({ area: "local" }).get(
        API_VERIFICATION_HISTORY_STORAGE_KEYS.VERIFICATION_RESULT_HISTORY,
      ),
    )
    expect(raw).not.toContain(identity)
    expect(raw).not.toContain(request.apiKey)
    expect(raw).not.toContain(request.baseUrl)
    expect(raw).not.toContain("requiresCredentialVerification")
  } finally {
    vi.restoreAllMocks()
  }
})
