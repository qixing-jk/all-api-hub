import { beforeEach, describe, expect, it, vi } from "vitest"

import { STORAGE_KEYS } from "~/services/core/storageKeys"
import { starPromotionState } from "~/services/starPromotion/state"

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
  watch: vi.fn(),
  unwatch: vi.fn(),
  getAllAccounts: vi.fn(),
  withWriteLock: vi.fn(async (_name: string, task: () => unknown) => task()),
}))

vi.mock("@plasmohq/storage", () => ({
  Storage: class {
    get = mocks.get
    set = mocks.set
    remove = mocks.remove
    watch = mocks.watch
    unwatch = mocks.unwatch
  },
}))

vi.mock("~/services/accounts/accountStorage/accountQueries", () => ({
  accountQueries: { getAllAccounts: mocks.getAllAccounts },
}))

vi.mock("~/services/core/storageWriteLock", () => ({
  withExtensionStorageWriteLock: mocks.withWriteLock,
}))

describe("starPromotionState", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.get.mockResolvedValue(undefined)
    mocks.set.mockResolvedValue(undefined)
    mocks.getAllAccounts.mockResolvedValue(
      Array.from({ length: 7 }, (_, index) => ({ id: `account-${index}` })),
    )
  })

  it("anchors a missing stored state to the current managed-account count", async () => {
    const state = await starPromotionState.getState()

    expect(state.baselineAccountCount).toBe(7)
    expect(mocks.set).toHaveBeenCalledWith(
      STORAGE_KEYS.STAR_PROMOTION_STATE,
      expect.objectContaining({ baselineAccountCount: 7 }),
    )
  })

  it("preserves an existing stored account baseline", async () => {
    mocks.get.mockResolvedValue({
      status: "active",
      baselineAccountCount: 3,
    })

    const state = await starPromotionState.getState()

    expect(state.baselineAccountCount).toBe(3)
    expect(mocks.getAllAccounts).not.toHaveBeenCalled()
    expect(mocks.set).not.toHaveBeenCalled()
  })

  it("anchors the account baseline when the first operation is a mutation", async () => {
    await starPromotionState.markCompleted()

    expect(mocks.set).toHaveBeenCalledWith(
      STORAGE_KEYS.STAR_PROMOTION_STATE,
      expect.objectContaining({
        status: "completed",
        baselineAccountCount: 7,
      }),
    )
  })

  it("rejects a completion when the persisted mutation fails", async () => {
    mocks.get.mockResolvedValue({
      status: "active",
      baselineAccountCount: 3,
    })
    mocks.set.mockRejectedValue(new Error("write failed"))

    await expect(starPromotionState.markCompleted()).rejects.toThrow(
      "write failed",
    )
  })

  it("does not overwrite storage after a failed read", async () => {
    mocks.get.mockRejectedValue(new Error("read failed"))

    const state = await starPromotionState.getState()

    expect(state.baselineAccountCount).toBe(0)
    expect(mocks.set).not.toHaveBeenCalled()
  })

  it("normalizes watched storage changes and unregisters the same callback", () => {
    let callbacks: Record<string, (change: { newValue: unknown }) => void> = {}
    mocks.watch.mockImplementation((nextCallbacks) => {
      callbacks = nextCallbacks
      return true
    })
    const listener = vi.fn()

    const unwatch = starPromotionState.watchState(listener)
    callbacks[STORAGE_KEYS.STAR_PROMOTION_STATE]?.({
      newValue: { status: "completed" },
    })
    unwatch()

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed" }),
    )
    expect(mocks.unwatch).toHaveBeenCalledWith(callbacks)
  })
})
