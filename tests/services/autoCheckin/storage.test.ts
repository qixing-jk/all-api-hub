import { beforeEach, describe, expect, it, vi } from "vitest"

import { Storage } from "@plasmohq/storage"

import { autoCheckinStorage } from "~/services/checkin/autoCheckin/storage"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
} from "~/types/autoCheckin"

const { mockWithExtensionStorageWriteLock } = vi.hoisted(() => ({
  mockWithExtensionStorageWriteLock: vi.fn(
    async (_key: string, work: () => Promise<unknown>) => await work(),
  ),
}))

vi.mock("@plasmohq/storage", () => {
  const set = vi.fn()
  const get = vi.fn()
  const remove = vi.fn()

  /**
   * Minimal mock implementation of the Plasmo Storage class used in tests.
   */
  function Storage(this: any) {
    this.set = set
    this.get = get
    this.remove = remove
  }

  ;(Storage as any).__mocks = { set, get, remove }

  return { Storage, __esModule: true }
})

vi.mock("~/services/core/storageWriteLock", () => ({
  withExtensionStorageWriteLock: mockWithExtensionStorageWriteLock,
}))

describe("autoCheckinStorage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("getStatus should return stored status when present", async () => {
    const status = { lastRunResult: "success" }
    const { get } = (Storage as any).__mocks as {
      set: ReturnType<typeof vi.fn>
      get: ReturnType<typeof vi.fn>
      remove: ReturnType<typeof vi.fn>
    }
    get.mockResolvedValueOnce(status)

    const result = await autoCheckinStorage.getStatus()

    expect(get).toHaveBeenCalledWith("autoCheckin_status")
    expect(result).toEqual(status)
  })

  it("getStatus should return null and log error on failure", async () => {
    const { get } = (Storage as any).__mocks as any
    get.mockRejectedValueOnce(new Error("read error"))

    const result = await autoCheckinStorage.getStatus()

    expect(result).toBeNull()
  })

  it("saveStatus should store status and return true", async () => {
    const { set } = (Storage as any).__mocks as any
    set.mockResolvedValueOnce(undefined)

    const status = { lastRunResult: "success" } as any
    const ok = await autoCheckinStorage.saveStatus(status)

    expect(set).toHaveBeenCalledWith("autoCheckin_status", status)
    expect(ok).toBe(true)
  })

  it("saveStatus should return false on error", async () => {
    const { set } = (Storage as any).__mocks as any
    set.mockRejectedValueOnce(new Error("write error"))

    const ok = await autoCheckinStorage.saveStatus({} as any)

    expect(ok).toBe(false)
  })

  it("clearStatus should remove key and return true", async () => {
    const { remove } = (Storage as any).__mocks as any
    remove.mockResolvedValueOnce(undefined)

    const ok = await autoCheckinStorage.clearStatus()

    expect(remove).toHaveBeenCalledWith("autoCheckin_status")
    expect(ok).toBe(true)
  })

  it("clearStatus should return false on error", async () => {
    const { remove } = (Storage as any).__mocks as any
    remove.mockRejectedValueOnce(new Error("remove error"))

    const ok = await autoCheckinStorage.clearStatus()

    expect(ok).toBe(false)
  })

  it("prunes deleted account ids from per-account, snapshots, and retry state", async () => {
    const { get, set } = (Storage as any).__mocks as any
    get.mockResolvedValueOnce({
      perAccount: {
        keep: {
          accountId: "keep",
          accountName: "Keep",
          status: CHECKIN_RESULT_STATUS.SUCCESS,
          timestamp: 1700000000000,
        },
        drop: {
          accountId: "drop",
          accountName: "Drop",
          status: CHECKIN_RESULT_STATUS.FAILED,
          timestamp: 1700000001000,
        },
      },
      accountsSnapshot: [{ accountId: "keep" }, { accountId: "drop" }],
      retryState: {
        day: "2026-03-28",
        pendingAccountIds: ["keep", "drop"],
        attemptsByAccount: {
          keep: 1,
          drop: 2,
        },
      },
      pendingRetry: true,
      nextRetryScheduledAt: "2026-03-28T01:00:00.000Z",
      retryAlarmTargetDay: "2026-03-28",
    })

    const ok = await autoCheckinStorage.pruneStatusForDeletedAccounts([
      "drop",
      "drop",
      "",
    ])

    expect(ok).toBe(true)
    expect(mockWithExtensionStorageWriteLock).toHaveBeenCalled()
    expect(set).toHaveBeenCalledWith("autoCheckin_status", {
      perAccount: {
        keep: {
          accountId: "keep",
          accountName: "Keep",
          status: CHECKIN_RESULT_STATUS.SUCCESS,
          timestamp: 1700000000000,
        },
      },
      accountsSnapshot: [{ accountId: "keep" }],
      summary: {
        totalEligible: 1,
        executed: 1,
        successCount: 1,
        failedCount: 0,
        skippedCount: 0,
        needsRetry: false,
      },
      lastRunResult: "success",
      retryState: {
        day: "2026-03-28",
        pendingAccountIds: ["keep"],
        attemptsByAccount: {
          keep: 1,
        },
      },
      pendingRetry: true,
      nextRetryScheduledAt: "2026-03-28T01:00:00.000Z",
      retryAlarmTargetDay: "2026-03-28",
    })
  })

  it("clears invalid shapes and resets retry scheduling when nothing valid remains", async () => {
    const { get, set } = (Storage as any).__mocks as any
    get.mockResolvedValueOnce({
      perAccount: "broken",
      accountsSnapshot: "broken",
      retryState: {
        day: 123,
        pendingAccountIds: "broken",
        attemptsByAccount: [],
      },
      pendingRetry: true,
      nextRetryScheduledAt: "2026-03-28T01:00:00.000Z",
      retryAlarmTargetDay: "2026-03-28",
    })

    const ok = await autoCheckinStorage.pruneStatusForDeletedAccounts(["drop"])

    expect(ok).toBe(true)
    expect(set).toHaveBeenCalledWith("autoCheckin_status", {
      perAccount: undefined,
      accountsSnapshot: undefined,
      summary: undefined,
      lastRunResult: undefined,
      retryState: undefined,
      pendingRetry: false,
      nextRetryScheduledAt: undefined,
      retryAlarmTargetDay: undefined,
    })
  })

  it("returns true without persisting when there is nothing to prune", async () => {
    const { get, set } = (Storage as any).__mocks as any
    get.mockResolvedValueOnce({
      perAccount: {
        keep: { status: "success" },
      },
      accountsSnapshot: [{ accountId: "keep" }],
      retryState: {
        day: "2026-03-28",
        pendingAccountIds: ["keep"],
        attemptsByAccount: { keep: 1 },
      },
      pendingRetry: true,
    })

    await expect(
      autoCheckinStorage.pruneStatusForDeletedAccounts(["missing"]),
    ).resolves.toBe(true)
    expect(set).not.toHaveBeenCalled()

    await expect(
      autoCheckinStorage.pruneStatusForDeletedAccounts([]),
    ).resolves.toBe(true)
    expect(get).toHaveBeenCalledTimes(1)
  })

  it("marks a disabled account as skipped and removes it from retry state", async () => {
    const { get, set } = (Storage as any).__mocks as any
    get.mockResolvedValueOnce({
      perAccount: {
        keep: {
          accountId: "keep",
          accountName: "Keep",
          status: CHECKIN_RESULT_STATUS.SUCCESS,
          timestamp: 1700000000000,
        },
        drop: {
          accountId: "drop",
          accountName: "Drop",
          status: CHECKIN_RESULT_STATUS.FAILED,
          timestamp: 1700000001000,
        },
      },
      summary: {
        totalEligible: 2,
        executed: 2,
        successCount: 1,
        failedCount: 1,
        skippedCount: 0,
        needsRetry: true,
      },
      lastRunResult: "partial",
      accountsSnapshot: [
        {
          accountId: "drop",
          accountName: "Drop",
          siteType: "one-api",
          detectionEnabled: true,
          autoCheckinEnabled: true,
          providerAvailable: true,
        },
      ],
      retryState: {
        day: "2026-03-28",
        pendingAccountIds: ["drop"],
        attemptsByAccount: { drop: 2 },
      },
      pendingRetry: true,
      nextRetryScheduledAt: "2026-03-28T01:00:00.000Z",
      retryAlarmTargetDay: "2026-03-28",
    })

    const ok = await autoCheckinStorage.markAccountDisabledInStatus(
      "drop",
      "Drop",
    )

    expect(ok).toBe(true)
    expect(set).toHaveBeenCalledWith(
      "autoCheckin_status",
      expect.objectContaining({
        lastRunResult: "success",
        pendingRetry: false,
        nextRetryScheduledAt: undefined,
        retryAlarmTargetDay: undefined,
        retryState: undefined,
        summary: {
          totalEligible: 2,
          executed: 1,
          successCount: 1,
          failedCount: 0,
          skippedCount: 1,
          needsRetry: false,
        },
        perAccount: expect.objectContaining({
          keep: expect.objectContaining({
            status: CHECKIN_RESULT_STATUS.SUCCESS,
          }),
          drop: expect.objectContaining({
            accountId: "drop",
            accountName: "Drop",
            status: CHECKIN_RESULT_STATUS.SKIPPED,
            reasonCode: AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DISABLED,
            messageKey: "autoCheckin:skipReasons.account_disabled",
          }),
        }),
        accountsSnapshot: [
          expect.objectContaining({
            accountId: "drop",
            skipReason: AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DISABLED,
            lastResult: expect.objectContaining({
              accountId: "drop",
              status: CHECKIN_RESULT_STATUS.SKIPPED,
            }),
          }),
        ],
      }),
    )
  })

  it("does not synthesize disabled rows for accounts missing from status history and snapshots", async () => {
    const { get, set } = (Storage as any).__mocks as any
    get.mockResolvedValueOnce({
      perAccount: {
        keep: {
          accountId: "keep",
          accountName: "Keep",
          status: CHECKIN_RESULT_STATUS.SUCCESS,
          timestamp: 1700000000000,
        },
      },
      accountsSnapshot: [
        {
          accountId: "keep",
          accountName: "Keep",
          siteType: "one-api",
          detectionEnabled: true,
          autoCheckinEnabled: true,
          providerAvailable: true,
        },
      ],
      summary: {
        totalEligible: 1,
        executed: 1,
        successCount: 1,
        failedCount: 0,
        skippedCount: 0,
        needsRetry: false,
      },
      lastRunResult: "success",
    })

    await expect(
      autoCheckinStorage.markAccountsDisabledInStatus([
        { accountId: "phantom", accountName: "Phantom" },
      ]),
    ).resolves.toBe(true)

    expect(set).not.toHaveBeenCalled()
  })

  it("returns true without persisting when disabled-account marking receives no usable ids or status", async () => {
    const { get, set } = (Storage as any).__mocks as any

    await expect(
      autoCheckinStorage.markAccountsDisabledInStatus([
        { accountId: "" },
        { accountId: "" },
      ]),
    ).resolves.toBe(true)
    expect(get).not.toHaveBeenCalled()
    expect(set).not.toHaveBeenCalled()

    get.mockResolvedValueOnce(null)

    await expect(
      autoCheckinStorage.markAccountsDisabledInStatus([
        { accountId: "missing" },
      ]),
    ).resolves.toBe(true)
    expect(set).not.toHaveBeenCalled()
  })

  it("returns false when disabled-account marking cannot persist the updated status", async () => {
    const { get, set } = (Storage as any).__mocks as any
    get.mockResolvedValueOnce({
      perAccount: {
        failed: {
          accountId: "failed",
          accountName: "Failed Account",
          status: CHECKIN_RESULT_STATUS.FAILED,
          timestamp: 1700000001000,
        },
      },
      summary: {
        totalEligible: 1,
        executed: 1,
        successCount: 0,
        failedCount: 1,
        skippedCount: 0,
        needsRetry: true,
      },
      lastRunResult: "failed",
    })
    set.mockRejectedValueOnce(new Error("write failed"))

    await expect(
      autoCheckinStorage.markAccountsDisabledInStatus([
        { accountId: "failed" },
      ]),
    ).resolves.toBe(false)
  })
})
