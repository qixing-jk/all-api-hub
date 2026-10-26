import { beforeEach, describe, expect, it, vi } from "vitest"

import { API_VERIFICATION_PROBE_IDS } from "~/services/verification/aiApiVerification/types"

const mockLoadOverrides = vi.fn()
let storageListener:
  | ((changes: Record<string, unknown>, area: string) => void)
  | null = null

vi.mock("~/services/verification/promptOverrides", () => ({
  loadProbePromptOverrides: () => mockLoadOverrides(),
}))

vi.mock("~/utils/browser/storage", () => ({
  onStorageChanged: (
    listener: (changes: Record<string, unknown>, area: string) => void,
  ) => {
    storageListener = listener
    return () => {
      storageListener = null
    }
  },
}))

const importStore = async () => {
  const store = await import("~/services/verification/probePromptStore")
  store.resetProbePromptOverridesCacheForTests()
  return store
}

describe("probe prompt store", () => {
  beforeEach(() => {
    mockLoadOverrides.mockReset()
    storageListener = null
  })

  it("reads the saved overrides once and reuses them", async () => {
    mockLoadOverrides.mockResolvedValue({
      [API_VERIFICATION_PROBE_IDS.TextGeneration]: "Say YES",
    })
    const store = await importStore()

    await expect(store.getProbePromptOverrides()).resolves.toEqual({
      [API_VERIFICATION_PROBE_IDS.TextGeneration]: "Say YES",
    })
    await store.getProbePromptOverrides()

    expect(mockLoadOverrides).toHaveBeenCalledTimes(1)
  })

  it("shares one in-flight read between concurrent callers", async () => {
    mockLoadOverrides.mockResolvedValue({})
    const store = await importStore()

    await Promise.all([
      store.getProbePromptOverrides(),
      store.getProbePromptOverrides(),
    ])

    expect(mockLoadOverrides).toHaveBeenCalledTimes(1)
  })

  it("re-reads after a preferences write in another context", async () => {
    mockLoadOverrides.mockResolvedValue({})
    const store = await importStore()
    await store.getProbePromptOverrides()

    mockLoadOverrides.mockResolvedValue({
      [API_VERIFICATION_PROBE_IDS.Embedding]: "ping now",
    })
    expect(storageListener).toBeTruthy()
    storageListener!(
      { user_preferences: { oldValue: 1, newValue: 2 } },
      "local",
    )

    await expect(store.getProbePromptOverrides()).resolves.toEqual({
      [API_VERIFICATION_PROBE_IDS.Embedding]: "ping now",
    })
    expect(mockLoadOverrides).toHaveBeenCalledTimes(2)
  })

  it("ignores unrelated storage areas and keys", async () => {
    mockLoadOverrides.mockResolvedValue({})
    const store = await importStore()
    await store.getProbePromptOverrides()

    storageListener!({ user_preferences: {} }, "sync")
    storageListener!({ somethingElse: {} }, "local")

    await store.getProbePromptOverrides()
    expect(mockLoadOverrides).toHaveBeenCalledTimes(1)
  })

  it("does not cache a read that an invalidation superseded", async () => {
    let resolveStale!: (overrides: Record<string, string>) => void
    mockLoadOverrides.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveStale = resolve
      }),
    )
    const store = await importStore()

    const pendingRead = store.getProbePromptOverrides()
    mockLoadOverrides.mockResolvedValue({
      [API_VERIFICATION_PROBE_IDS.Embedding]: "ping now",
    })
    storageListener!(
      { user_preferences: { oldValue: 1, newValue: 2 } },
      "local",
    )
    resolveStale({ [API_VERIFICATION_PROBE_IDS.TextGeneration]: "stale" })
    await expect(pendingRead).resolves.toEqual({
      [API_VERIFICATION_PROBE_IDS.TextGeneration]: "stale",
    })

    await expect(store.getProbePromptOverrides()).resolves.toEqual({
      [API_VERIFICATION_PROBE_IDS.Embedding]: "ping now",
    })
    expect(mockLoadOverrides).toHaveBeenCalledTimes(2)
  })

  it("keeps a newer in-flight read shared after a superseded one settles", async () => {
    let resolveStale!: (overrides: Record<string, string>) => void
    let resolveFresh!: (overrides: Record<string, string>) => void
    mockLoadOverrides
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveStale = resolve
        }),
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFresh = resolve
        }),
      )
    const store = await importStore()

    const staleRead = store.getProbePromptOverrides()
    storageListener!(
      { user_preferences: { oldValue: 1, newValue: 2 } },
      "local",
    )
    const freshRead = store.getProbePromptOverrides()
    resolveStale({ [API_VERIFICATION_PROBE_IDS.TextGeneration]: "stale" })
    await staleRead

    const joinedRead = store.getProbePromptOverrides()
    expect(mockLoadOverrides).toHaveBeenCalledTimes(2)

    resolveFresh({ [API_VERIFICATION_PROBE_IDS.Embedding]: "ping now" })
    await expect(Promise.all([freshRead, joinedRead])).resolves.toEqual([
      { [API_VERIFICATION_PROBE_IDS.Embedding]: "ping now" },
      { [API_VERIFICATION_PROBE_IDS.Embedding]: "ping now" },
    ])
  })

  it("does not cache a failed read as an empty override set", async () => {
    mockLoadOverrides.mockRejectedValueOnce(new Error("unreadable"))
    const store = await importStore()

    await expect(store.getProbePromptOverrides()).rejects.toThrow("unreadable")

    mockLoadOverrides.mockResolvedValue({
      [API_VERIFICATION_PROBE_IDS.TextGeneration]: "Say YES",
    })
    await expect(store.getProbePromptOverrides()).resolves.toEqual({
      [API_VERIFICATION_PROBE_IDS.TextGeneration]: "Say YES",
    })
  })
})
