import { beforeEach, describe, expect, it, vi } from "vitest"

import { STORAGE_KEYS } from "~/services/core/storageKeys"
import { STAR_PROMOTION_COMPLETION_SOURCES } from "~/services/starPromotion/contracts"
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

  it("records automatic completion as detected", async () => {
    mocks.get.mockResolvedValue({ status: "active", baselineAccountCount: 3 })
    await starPromotionState.recordGitHubStarState(true)
    expect(mocks.set).toHaveBeenCalledWith(
      STORAGE_KEYS.STAR_PROMOTION_STATE,
      expect.objectContaining({
        status: "completed",
        completionSource: "detected",
        githubStarred: true,
      }),
    )
  })

  it("restores eligibility with a cooldown after a detected star is removed", async () => {
    mocks.get.mockResolvedValue({
      status: "completed",
      completionSource: STAR_PROMOTION_COMPLETION_SOURCES.Detected,
      githubStarred: true,
      baselineAccountCount: 3,
      nextThreshold: 30,
    })
    await starPromotionState.recordGitHubStarState(false, { starRemoved: true })
    expect(mocks.set).toHaveBeenCalledWith(
      STORAGE_KEYS.STAR_PROMOTION_STATE,
      expect.objectContaining({
        status: "active",
        githubStarred: false,
        nextThreshold: 60,
        deferredUntil: expect.any(Number),
      }),
    )
  })

  it("preserves detected completion after a stale initial unstarred observation", async () => {
    mocks.get.mockResolvedValue({
      status: "completed",
      completionSource: "detected",
      githubStarred: true,
      baselineAccountCount: 3,
    })
    await starPromotionState.recordGitHubStarState(false)
    expect(mocks.set).toHaveBeenCalledWith(
      STORAGE_KEYS.STAR_PROMOTION_STATE,
      expect.objectContaining({
        status: "completed",
        githubStarred: true,
        completionSource: "detected",
      }),
    )
  })

  it("records an unstarred observation without undoing explicit confirmation or cooldown", async () => {
    mocks.get.mockResolvedValue({
      status: "completed",
      completionSource: STAR_PROMOTION_COMPLETION_SOURCES.Confirmed,
      baselineAccountCount: 3,
      deferredUntil: 123456,
      githubStarred: true,
    })
    await starPromotionState.recordGitHubStarState(false)
    expect(mocks.set).toHaveBeenCalledWith(
      STORAGE_KEYS.STAR_PROMOTION_STATE,
      expect.objectContaining({
        status: "completed",
        githubStarred: false,
        deferredUntil: 123456,
      }),
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

  it("preserves a baseline initialized by another context while waiting for the lock", async () => {
    mocks.get
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ status: "active", baselineAccountCount: 4 })

    const state = await starPromotionState.getState()

    expect(state.baselineAccountCount).toBe(4)
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

  it("rejects a first mutation when the account baseline cannot be read", async () => {
    mocks.getAllAccounts.mockRejectedValue(new Error("accounts unavailable"))

    await expect(starPromotionState.markCompleted()).rejects.toThrow(
      "Account count unavailable",
    )
    expect(mocks.set).not.toHaveBeenCalled()
  })

  it("lowers a stale account baseline before evaluating the prompt", async () => {
    mocks.get.mockResolvedValue({
      status: "active",
      baselineAccountCount: 10,
      nextAccountThreshold: 5,
    })

    await starPromotionState.isThresholdPromptDue()

    expect(mocks.set).toHaveBeenCalledWith(
      STORAGE_KEYS.STAR_PROMOTION_STATE,
      expect.objectContaining({ baselineAccountCount: 7 }),
    )
  })

  it("ignores non-positive and non-finite check-in increments", async () => {
    await starPromotionState.addCheckinSuccesses(0)
    await starPromotionState.addCheckinSuccesses(Number.NaN)

    expect(mocks.get).not.toHaveBeenCalled()
    expect(mocks.set).not.toHaveBeenCalled()
  })

  it("anchors a deferral to the live account count", async () => {
    mocks.get.mockResolvedValue({
      status: "active",
      baselineAccountCount: 0,
    })

    await starPromotionState.deferThresholdPrompt()

    expect(mocks.set).toHaveBeenCalledWith(
      STORAGE_KEYS.STAR_PROMOTION_STATE,
      expect.objectContaining({
        baselineAccountCount: 7,
        deferredUntil: expect.any(Number),
      }),
    )
  })

  it("falls back to the check-in signal when account reads fail", async () => {
    mocks.get.mockResolvedValue({
      status: "active",
      baselineAccountCount: 0,
    })
    mocks.getAllAccounts.mockRejectedValue(new Error("accounts unavailable"))

    await expect(starPromotionState.isThresholdPromptDue()).resolves.toBe(false)
  })

  it("resets stored state and contains reset failures to dev tooling", async () => {
    await starPromotionState.reset()
    expect(mocks.remove).toHaveBeenCalledWith(STORAGE_KEYS.STAR_PROMOTION_STATE)

    mocks.remove.mockRejectedValueOnce(new Error("remove failed"))
    await expect(starPromotionState.reset()).resolves.toBeUndefined()
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
