import { beforeEach, describe, expect, it, vi } from "vitest"

import { Storage } from "@plasmohq/storage"

import { managedSiteModelSyncStorage } from "~/services/models/modelSync/storage"

vi.mock("@plasmohq/storage", () => {
  const set = vi.fn()
  const get = vi.fn()
  const remove = vi.fn()

  /**
   * Minimal mock implementation of the Plasmo Storage class used in tests.
   */
  function Storage(this: unknown) {
    ;(this as { set: typeof set }).set = set
    ;(this as { get: typeof get }).get = get
    ;(this as { remove: typeof remove }).remove = remove
  }

  ;(Storage as unknown as { __mocks: unknown }).__mocks = { set, get, remove }

  return { Storage, __esModule: true }
})

const CANONICAL_KEYS = {
  LAST_EXECUTION: "managedSiteModelSync_lastExecution",
  CHANNEL_UPSTREAM_MODELS_CACHE:
    "managedSiteModelSync_channelUpstreamModelsCache",
} as const

const LEGACY_KEYS = {
  LAST_EXECUTION: "newApiModelSync_lastExecution",
  CHANNEL_UPSTREAM_MODELS_CACHE: "newApiModelSync_channelUpstreamModelsCache",
} as const

describe("managedSiteModelSyncStorage - storage key migration", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("getLastExecution reads canonical key when present", async () => {
    const execution = { statistics: { total: 0, successCount: 0 } } as any
    const { get, set } = (Storage as any).__mocks as {
      set: ReturnType<typeof vi.fn>
      get: ReturnType<typeof vi.fn>
      remove: ReturnType<typeof vi.fn>
    }

    get.mockResolvedValueOnce(execution)

    const result = await managedSiteModelSyncStorage.getLastExecution()

    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith(CANONICAL_KEYS.LAST_EXECUTION)
    expect(set).not.toHaveBeenCalled()
    expect(result).toEqual(execution)
  })

  it("getLastExecution falls back to legacy key and writes through to canonical", async () => {
    const legacyExecution = { statistics: { total: 1, successCount: 1 } } as any
    const { get, set, remove } = (Storage as any).__mocks as any

    get.mockResolvedValueOnce(undefined)
    get.mockResolvedValueOnce(legacyExecution)

    const result = await managedSiteModelSyncStorage.getLastExecution()

    expect(get).toHaveBeenCalledTimes(2)
    expect(get).toHaveBeenNthCalledWith(1, CANONICAL_KEYS.LAST_EXECUTION)
    expect(get).toHaveBeenNthCalledWith(2, LEGACY_KEYS.LAST_EXECUTION)
    expect(set).toHaveBeenCalledTimes(1)
    expect(set).toHaveBeenCalledWith(
      CANONICAL_KEYS.LAST_EXECUTION,
      legacyExecution,
    )
    expect(remove).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledWith(LEGACY_KEYS.LAST_EXECUTION)
    expect(result).toEqual(legacyExecution)
  })

  it("getLastExecution returns null when no value exists in either key", async () => {
    const { get, set } = (Storage as any).__mocks as any

    get.mockResolvedValueOnce(undefined)
    get.mockResolvedValueOnce(undefined)

    const result = await managedSiteModelSyncStorage.getLastExecution()

    expect(result).toBeNull()
    expect(set).not.toHaveBeenCalled()
  })

  it("getChannelUpstreamModelOptions falls back to legacy and normalizes before returning", async () => {
    const { get, set, remove } = (Storage as any).__mocks as any

    get.mockResolvedValueOnce(undefined)
    get.mockResolvedValueOnce(["  gpt-4o  ", "gpt-4o", "claude-3", "  "])

    const result =
      await managedSiteModelSyncStorage.getChannelUpstreamModelOptions()

    expect(get).toHaveBeenNthCalledWith(
      1,
      CANONICAL_KEYS.CHANNEL_UPSTREAM_MODELS_CACHE,
    )
    expect(get).toHaveBeenNthCalledWith(
      2,
      LEGACY_KEYS.CHANNEL_UPSTREAM_MODELS_CACHE,
    )
    expect(set).toHaveBeenCalledWith(
      CANONICAL_KEYS.CHANNEL_UPSTREAM_MODELS_CACHE,
      ["  gpt-4o  ", "gpt-4o", "claude-3", "  "],
    )
    expect(remove).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledWith(
      LEGACY_KEYS.CHANNEL_UPSTREAM_MODELS_CACHE,
    )
    expect(result).toEqual(["claude-3", "gpt-4o"])
  })

  it("saveLastExecution always writes canonical key", async () => {
    const { set } = (Storage as any).__mocks as any

    const execution = { statistics: { total: 0, successCount: 0 } } as any
    await managedSiteModelSyncStorage.saveLastExecution(execution)

    expect(set).toHaveBeenCalledWith(CANONICAL_KEYS.LAST_EXECUTION, execution)
    expect(set).not.toHaveBeenCalledWith(LEGACY_KEYS.LAST_EXECUTION, execution)
  })

  it("saveChannelUpstreamModelOptions always writes canonical key", async () => {
    const { set } = (Storage as any).__mocks as any

    await managedSiteModelSyncStorage.saveChannelUpstreamModelOptions([
      "  gpt-4o  ",
      "gpt-4o",
      "claude-3",
      "  ",
    ])

    expect(set).toHaveBeenCalledTimes(1)
    expect(set.mock.calls[0][0]).toBe(
      CANONICAL_KEYS.CHANNEL_UPSTREAM_MODELS_CACHE,
    )
    expect(set.mock.calls[0][1]).toEqual(["claude-3", "gpt-4o"])
  })
})
