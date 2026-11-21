import { beforeEach, describe, expect, it, vi } from "vitest"

import { OBSERVATION_STATUSES } from "~/services/amounts/financialConstants"
import {
  preserveCheckinAwards,
  readCheckinAwards,
} from "~/services/checkin/autoCheckin/awards"
import { autoCheckinStorage } from "~/services/checkin/autoCheckin/storage"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
} from "~/types/autoCheckin"

const {
  storageMocks,
  mockWithExtensionStorageWriteLock,
  trackStorageWriteFailureMock,
} = vi.hoisted(() => ({
  storageMocks: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
  mockWithExtensionStorageWriteLock: vi.fn(
    async (_key: string, work: () => Promise<unknown>) => await work(),
  ),
  trackStorageWriteFailureMock: vi.fn(),
}))

vi.mock("@plasmohq/storage", () => ({
  Storage: class {
    get = storageMocks.get
    set = storageMocks.set
    remove = storageMocks.remove
  },
}))

vi.mock("~/services/core/storageWriteLock", () => ({
  withExtensionStorageWriteLock: mockWithExtensionStorageWriteLock,
}))

vi.mock("~/services/productAnalytics/facts/storageWriteFailure", () => ({
  trackStorageWriteFailure: trackStorageWriteFailureMock,
}))

describe("autoCheckinStorage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each([true, false])(
    "retains confirmed grants when disabling a historical row (perAccount=%s)",
    async (inPerAccount) => {
      const { get, set } = storageMocks
      const awards = readCheckinAwards({
        accountId: "partial",
        timestamp: 1234,
        reward: { quota: 500000 },
      })
      const prior = {
        accountId: "partial",
        accountName: "Partial",
        status: "failed",
        reasonCode: "network_error",
        retryable: true,
        awards,
        timestamp: 1234,
      }
      get.mockResolvedValueOnce({
        perAccount: inPerAccount ? { partial: prior } : {},
        accountsSnapshot: [
          { accountId: "partial", accountName: "Partial", lastResult: prior },
        ],
      })
      await expect(
        autoCheckinStorage.markAccountDisabledInStatus("partial"),
      ).resolves.toBe(true)
      const written = set.mock.calls[0]![1]
      expect(written.perAccount.partial).toMatchObject({
        status: "skipped",
        awards,
      })
      expect(written.perAccount.partial.retryable).toBeUndefined()
      expect(written.accountsSnapshot[0].lastResult.awards).toEqual(awards)
    },
  )

  it.each(["", 42])(
    "refuses malformed local execution receipt identity %s",
    async (executionReceiptId) => {
      const { get, set } = storageMocks
      get.mockResolvedValueOnce({
        schemaVersion: 2,
        perAccount: { a: { executionReceiptId } },
      })
      const outcome = await autoCheckinStorage.updateStatus(() => ({
        patch: { lastRunResult: "success" },
      }))
      expect(outcome.ok).toBe(false)
      expect(set).not.toHaveBeenCalled()
    },
  )

  it.each([
    { perAccount: { a: { awardExecutionReceiptIds: "receipt" } } },
    { accountsSnapshot: [{ lastResult: { awardExecutionReceiptIds: [42] } }] },
    { perAccount: { a: { awardExecutionReceiptIds: ["receipt", " "] } } },
  ])(
    "protects stored awards when a receipt list is invalid: %j",
    async (stored) => {
      const { get, set } = storageMocks
      get.mockResolvedValueOnce(stored).mockResolvedValueOnce(stored)

      await expect(autoCheckinStorage.getStatus()).rejects.toThrow(
        "invalid_checkin_award_receipts",
      )
      await expect(
        autoCheckinStorage.updateStatus(() => ({
          patch: { lastRunResult: "success" },
        })),
      ).resolves.toMatchObject({ ok: false })
      expect(set).not.toHaveBeenCalled()
    },
  )

  it("returns null only when the caller opts out of status read errors", async () => {
    storageMocks.get.mockRejectedValueOnce(new Error("storage unavailable"))
    await expect(
      autoCheckinStorage.getStatus({ throwOnError: false }),
    ).resolves.toBeNull()

    storageMocks.get.mockResolvedValueOnce("invalid stored status")
    await expect(
      autoCheckinStorage.getStatus({ throwOnError: false }),
    ).rejects.toThrow("invalid_checkin_status")
  })

  it("retains a legacy award's original observation time when disabling the account", async () => {
    const { get, set } = storageMocks
    get.mockResolvedValueOnce({
      perAccount: {
        a: {
          accountId: "a",
          accountName: "A",
          status: "success",
          timestamp: 1234,
          reward: { quota: 500000 },
        },
      },
    })
    await autoCheckinStorage.markAccountDisabledInStatus("a")
    const written = set.mock.calls[0]![1].perAccount.a
    expect(readCheckinAwards(written)[0]?.amount).toMatchObject({
      status: "known",
      observedAt: 1234,
      source: { kind: "legacy" },
    })
  })

  it("does not carry yesterday's grants into today's execution after disabling", async () => {
    const { get, set } = storageMocks
    const today = new Date(2026, 10, 11, 12).getTime()
    const yesterday = today - 86400000
    get.mockResolvedValueOnce({
      perAccount: {
        a: {
          accountId: "a",
          accountName: "A",
          status: "success",
          timestamp: yesterday,
          reward: { quota: 500000 },
        },
      },
    })
    const clock = vi.spyOn(Date, "now").mockReturnValue(today)
    try {
      await autoCheckinStorage.markAccountDisabledInStatus("a")
      const disabled = set.mock.calls[0]![1].perAccount.a
      const next = {
        accountId: "a",
        accountName: "A",
        status: CHECKIN_RESULT_STATUS.SUCCESS,
        timestamp: today,
      }
      expect(readCheckinAwards(preserveCheckinAwards(disabled, next))).toEqual(
        [],
      )
    } finally {
      clock.mockRestore()
    }
  })

  it("refuses an unknown award status version without overwriting saved results", async () => {
    const { get, set } = storageMocks
    const future = {
      schemaVersion: 999,
      perAccount: { future: { awards: "future format" } },
    }
    get.mockResolvedValueOnce(future).mockResolvedValueOnce(future)
    const outcome = await autoCheckinStorage.updateStatus(() => ({
      patch: { lastRunResult: "success" },
    }))
    expect(outcome.ok).toBe(false)
    expect(set).not.toHaveBeenCalled()
    await expect(autoCheckinStorage.getStatus()).rejects.toThrow(
      "unsupported_checkin_status_version",
    )
  })

  it("does not overwrite the last result when a new confirmed award is malformed", async () => {
    const { get, set } = storageMocks
    get.mockResolvedValueOnce({
      perAccount: { account: { status: "success", timestamp: 1 } },
    })
    const outcome = await autoCheckinStorage.updateStatus(() => ({
      patch: {
        perAccount: {
          account: {
            accountId: "account",
            accountName: "Account",
            timestamp: 2,
            status: CHECKIN_RESULT_STATUS.SUCCESS,
            awards: [
              {
                id: "broken",
                amount: { status: OBSERVATION_STATUSES.Known, value: "NaN" },
              } as never,
            ],
          },
        },
      },
    }))
    expect(outcome.ok).toBe(false)
    expect(set).not.toHaveBeenCalled()
  })

  it("getStatus should return stored status when present", async () => {
    const status = { lastRunResult: "success" }
    const { get } = storageMocks
    get.mockResolvedValueOnce(status)

    const result = await autoCheckinStorage.getStatus()

    expect(get).toHaveBeenCalledWith("autoCheckin_status")
    expect(result).toEqual(status)
  })

  it("getStatus reports a failed read without presenting stored awards as absent", async () => {
    const { get } = storageMocks as any
    get.mockRejectedValueOnce(new Error("read error"))

    await expect(autoCheckinStorage.getStatus()).rejects.toThrow("read error")
  })

  it("lets diagnostic readers distinguish a read failure from empty storage", async () => {
    const { get } = storageMocks
    get.mockResolvedValueOnce(undefined)
    await expect(
      autoCheckinStorage.getStatus({ throwOnError: true }),
    ).resolves.toBeNull()
    get.mockRejectedValueOnce(new Error("read error"))
    await expect(
      autoCheckinStorage.getStatus({ throwOnError: true }),
    ).rejects.toThrow("read error")
  })

  it("updateStatus should merge the patch into the stored status", async () => {
    const { get, set } = storageMocks
    get.mockResolvedValueOnce({
      lastRunResult: "success",
      perAccount: { a: 1 },
    })
    set.mockResolvedValueOnce(undefined)

    const result = await autoCheckinStorage.updateStatus(() => ({
      patch: { lastRunResult: "failed" },
    }))

    expect(set).toHaveBeenCalledWith("autoCheckin_status", {
      schemaVersion: 2,
      lastRunResult: "failed",
      perAccount: { a: 1 },
    })
    expect(result).toEqual({ ok: true, result: null })
  })

  it("updateStatus should skip the write when the patch is null", async () => {
    const { get, set } = storageMocks
    get.mockResolvedValueOnce({ lastRunResult: "success" })

    const result = await autoCheckinStorage.updateStatus(() => ({
      patch: null,
    }))

    expect(set).not.toHaveBeenCalled()
    expect(result).toEqual({ ok: true, result: null })
  })

  it("updateStatus should hand the derived value back to the caller", async () => {
    const { get, set } = storageMocks
    get.mockResolvedValueOnce({ lastRunResult: "success" })
    set.mockResolvedValueOnce(undefined)

    const result = await autoCheckinStorage.updateStatus((current) => ({
      result: `was:${current?.lastRunResult}`,
      patch: { lastRunResult: "failed" },
    }))

    expect(result).toEqual({ ok: true, result: "was:success" })
  })

  it("updateStatus should read the stored status, not a caller snapshot", async () => {
    const { get, set } = storageMocks
    get.mockResolvedValueOnce({ perAccount: { a: 1 } })
    set.mockResolvedValueOnce(undefined)

    const seen: unknown[] = []
    await autoCheckinStorage.updateStatus((current) => {
      seen.push(current)
      return { patch: { lastRunResult: "failed" } }
    })

    expect(seen).toEqual([{ perAccount: { a: 1 } }])
  })

  it("updateStatus should not write when the read fails", async () => {
    const { get, set } = storageMocks
    get.mockRejectedValueOnce(new Error("read error"))

    const result = await autoCheckinStorage.updateStatus(() => ({
      patch: { lastRunResult: "failed" },
    }))

    expect(set).not.toHaveBeenCalled()
    expect(result).toEqual({ ok: false, result: null })
    expect(trackStorageWriteFailureMock).toHaveBeenCalledWith(
      expect.objectContaining({
        storageArea: "local",
        operation: "auto_checkin_status",
        failureStage: "read",
      }),
    )
  })

  it("updateStatus should report failure on write error", async () => {
    const { get, set } = storageMocks
    get.mockResolvedValueOnce({ lastRunResult: "success" })
    set.mockRejectedValueOnce(new Error("write error"))

    const result = await autoCheckinStorage.updateStatus(() => ({
      patch: { lastRunResult: "failed" },
    }))

    expect(result.ok).toBe(false)
    expect(trackStorageWriteFailureMock).toHaveBeenCalledWith(
      expect.objectContaining({
        storageArea: "local",
        operation: "auto_checkin_status",
        failureStage: "write",
      }),
    )
  })

  it("updateStatus should not write when deriving the patch throws", async () => {
    const { get, set } = storageMocks
    get.mockResolvedValueOnce({ lastRunResult: "success" })

    const result = await autoCheckinStorage.updateStatus(() => {
      throw new Error("cannot derive patch")
    })

    expect(set).not.toHaveBeenCalled()
    expect(result).toEqual({ ok: false, result: null })
    expect(trackStorageWriteFailureMock).toHaveBeenCalledWith(
      expect.objectContaining({
        storageArea: "local",
        operation: "auto_checkin_status",
        failureStage: "apply",
      }),
    )
  })

  it("clearStatus should remove key and return true", async () => {
    const { remove } = storageMocks
    remove.mockResolvedValueOnce(undefined)

    const ok = await autoCheckinStorage.clearStatus()

    expect(remove).toHaveBeenCalledWith("autoCheckin_status")
    expect(ok).toBe(true)
  })

  it("clearStatus should return false on error", async () => {
    const { remove } = storageMocks
    remove.mockRejectedValueOnce(new Error("remove error"))

    const ok = await autoCheckinStorage.clearStatus()

    expect(ok).toBe(false)
  })

  it("prunes deleted account ids from per-account, snapshots, and retry state", async () => {
    const { get, set } = storageMocks
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
      schemaVersion: 2,
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
    const { get, set } = storageMocks
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
      schemaVersion: 2,
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
    const { get, set } = storageMocks
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

  it("returns true without persisting when there is no stored status to prune", async () => {
    const { get, set } = storageMocks
    get.mockResolvedValueOnce(null)

    await expect(
      autoCheckinStorage.pruneStatusForDeletedAccounts(["missing"]),
    ).resolves.toBe(true)

    expect(set).not.toHaveBeenCalled()
  })

  it("marks a disabled account as skipped and removes it from retry state", async () => {
    const { get, set } = storageMocks
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
    const { get, set } = storageMocks
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

  it("preserves snapshot-derived totalEligible when current summary is missing", async () => {
    const { get, set } = storageMocks
    get.mockResolvedValueOnce({
      accountsSnapshot: [
        {
          accountId: "drop",
          accountName: "Drop",
          siteType: "one-api",
          detectionEnabled: true,
          autoCheckinEnabled: true,
          providerAvailable: true,
        },
        {
          accountId: "keep",
          accountName: "Keep",
          siteType: "one-api",
          detectionEnabled: true,
          autoCheckinEnabled: true,
          providerAvailable: true,
        },
      ],
    })

    const ok = await autoCheckinStorage.markAccountDisabledInStatus(
      "drop",
      "Drop",
    )

    expect(ok).toBe(true)
    expect(set).toHaveBeenCalledWith(
      "autoCheckin_status",
      expect.objectContaining({
        summary: expect.objectContaining({
          totalEligible: 2,
          executed: 0,
          skippedCount: 1,
        }),
      }),
    )
  })

  it("preserves the remaining retry schedule and resolves disabled account names", async () => {
    const { get, set } = storageMocks
    get.mockResolvedValueOnce({
      perAccount: {
        drop: {
          accountId: "drop",
          status: CHECKIN_RESULT_STATUS.FAILED,
          timestamp: 1700000001000,
        },
        "id-only": {
          accountId: "id-only",
          status: CHECKIN_RESULT_STATUS.FAILED,
          timestamp: 1700000002000,
        },
        keep: {
          accountId: "keep",
          accountName: "Keep",
          status: CHECKIN_RESULT_STATUS.FAILED,
          timestamp: 1700000003000,
        },
      },
      accountsSnapshot: [
        {
          accountId: "drop",
          accountName: "Snapshot Drop",
        },
      ],
      retryState: {
        day: "2026-03-28",
        pendingAccountIds: ["drop", "keep"],
        attemptsByAccount: { drop: 2, keep: 1 },
      },
      pendingRetry: true,
      nextRetryScheduledAt: "2026-03-28T01:00:00.000Z",
      retryAlarmTargetDay: "2026-03-28",
    })

    await expect(
      autoCheckinStorage.markAccountsDisabledInStatus([
        { accountId: "drop" },
        { accountId: "id-only" },
      ]),
    ).resolves.toBe(true)

    expect(set).toHaveBeenCalledWith(
      "autoCheckin_status",
      expect.objectContaining({
        pendingRetry: true,
        nextRetryScheduledAt: "2026-03-28T01:00:00.000Z",
        retryAlarmTargetDay: "2026-03-28",
        retryState: {
          day: "2026-03-28",
          pendingAccountIds: ["keep"],
          attemptsByAccount: { keep: 1 },
        },
        perAccount: expect.objectContaining({
          drop: expect.objectContaining({ accountName: "Snapshot Drop" }),
          "id-only": expect.objectContaining({ accountName: "id-only" }),
        }),
      }),
    )
  })

  it("preserves retry state attempts ledger when pruning leaves pending accounts empty", async () => {
    const { get, set } = storageMocks
    get.mockResolvedValueOnce({
      perAccount: {
        keep: {
          accountId: "keep",
          accountName: "Keep",
          status: CHECKIN_RESULT_STATUS.SUCCESS,
          timestamp: 1700000003000,
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
        pendingAccountIds: ["drop"],
        attemptsByAccount: { drop: 2, keep: 1 },
      },
      pendingRetry: true,
      nextRetryScheduledAt: "2026-03-28T01:00:00.000Z",
      retryAlarmTargetDay: "2026-03-28",
    })

    const ok = await autoCheckinStorage.pruneStatusForDeletedAccounts(["drop"])

    expect(ok).toBe(true)
    expect(set).toHaveBeenCalledWith(
      "autoCheckin_status",
      expect.objectContaining({
        retryState: {
          day: "2026-03-28",
          pendingAccountIds: [],
          attemptsByAccount: { keep: 1 },
        },
      }),
    )
  })

  it("clears malformed retry queue fields when disabling a queued account", async () => {
    const { get, set } = storageMocks
    get.mockResolvedValueOnce({
      perAccount: {
        drop: {
          accountId: "drop",
          status: CHECKIN_RESULT_STATUS.FAILED,
          timestamp: 1700000001000,
        },
      },
      retryState: {
        day: "2026-03-28",
        pendingAccountIds: "broken",
        attemptsByAccount: [],
      },
      pendingRetry: true,
    })

    await expect(
      autoCheckinStorage.markAccountDisabledInStatus("drop"),
    ).resolves.toBe(true)

    expect(set).toHaveBeenCalledWith(
      "autoCheckin_status",
      expect.objectContaining({
        retryState: undefined,
        pendingRetry: false,
      }),
    )
  })

  it("returns true without persisting when disabled-account marking receives no usable ids or status", async () => {
    const { get, set } = storageMocks

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
    const { get, set } = storageMocks
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

  it("clears malformed retry state when pruning the last stored account", async () => {
    const { get, set } = storageMocks
    get.mockResolvedValueOnce({
      perAccount: {
        drop: {
          accountId: "drop",
          status: CHECKIN_RESULT_STATUS.FAILED,
          timestamp: 1700000001000,
        },
      },
      retryState: "broken",
      pendingRetry: true,
      nextRetryScheduledAt: "2026-03-28T01:00:00.000Z",
      retryAlarmTargetDay: "2026-03-28",
    })

    await expect(
      autoCheckinStorage.pruneStatusForDeletedAccounts(["drop"]),
    ).resolves.toBe(true)

    expect(set).toHaveBeenCalledWith(
      "autoCheckin_status",
      expect.objectContaining({
        perAccount: undefined,
        summary: undefined,
        lastRunResult: undefined,
        retryState: undefined,
        pendingRetry: false,
        nextRetryScheduledAt: undefined,
        retryAlarmTargetDay: undefined,
      }),
    )
  })

  it("reports pruning failure without writing when status cannot be read", async () => {
    const { get, set } = storageMocks
    get.mockRejectedValueOnce(new Error("read failed"))

    await expect(
      autoCheckinStorage.pruneStatusForDeletedAccounts(["drop"]),
    ).resolves.toBe(false)

    expect(set).not.toHaveBeenCalled()
  })
})
