import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useBalanceHistoryData } from "~/features/BalanceHistory/data/useBalanceHistoryData"
import { BalanceHistoryMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import type { DailyBalanceHistoryStore } from "~/types/dailyBalanceHistory"
import { DAILY_BALANCE_HISTORY_CAPTURE_SOURCES } from "~/types/dailyBalanceHistory"
import { createDeferred } from "~~/tests/test-utils/deferred"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const mocks = vi.hoisted(() => ({
  accounts: vi.fn(),
  store: vi.fn(),
  tags: vi.fn(),
  message: vi.fn(),
  complete: vi.fn(),
  loading: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  dismiss: vi.fn(),
}))
vi.mock("~/services/accounts/accountStorage/accountQueries", () => ({
  accountQueries: { getAllAccountsOrThrow: mocks.accounts },
}))
vi.mock("~/services/history/dailyBalanceHistory/storage", () => ({
  dailyBalanceHistoryStorage: { getStore: mocks.store },
}))
vi.mock("~/services/history/dailyBalanceHistory/messaging", () => ({
  sendBalanceHistoryMessage: mocks.message,
}))
vi.mock("~/services/tags/tagStorage", () => ({
  tagStorage: { getTagStore: mocks.tags },
}))
vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: () => ({ complete: mocks.complete }),
}))
vi.mock("~/services/protectionBypass/client", () => ({
  withProtectionBypassUserCommand: (
    _command: unknown,
    _surface: unknown,
    work: (execution: unknown) => Promise<unknown>,
  ) => work({}),
}))
vi.mock("~/lib/notify", () => ({
  default: {
    loading: mocks.loading,
    success: mocks.success,
    warning: mocks.warning,
    error: mocks.error,
    dismiss: mocks.dismiss,
  },
}))
const empty: DailyBalanceHistoryStore = {
  schemaVersion: 4,
  referenceSnapshotsByAccountId: {},
}

it("retains accounts and history during a current-balance outage", async () => {
  const account = buildSiteAccount({ id: "outage" })
  account.account_info.balanceUnavailable = true
  mocks.accounts.mockResolvedValue([account])
  const history: DailyBalanceHistoryStore = {
    schemaVersion: 4,
    referenceSnapshotsByAccountId: {
      outage: {
        "2026-01-01": {
          balanceUsd: 1,
          incomeUsd: null,
          consumptionUsd: null,
          capturedAt: 1,
          source: DAILY_BALANCE_HISTORY_CAPTURE_SOURCES.Refresh,
        },
      },
    },
  }
  mocks.store.mockResolvedValue(history)
  mocks.tags.mockResolvedValue({ version: 1, tagsById: {} })
  const { result } = renderHook(() => useBalanceHistoryData([]))
  await act(async () => {})
  expect(result.current.accounts.map((account) => account.id)).toContain(
    "outage",
  )
  expect(result.current.store).toEqual(history)
})
const beforePrune: DailyBalanceHistoryStore = {
  schemaVersion: 4,
  referenceSnapshotsByAccountId: {
    old: {
      "2026-01-01": {
        balanceUsd: 0.000002,
        incomeUsd: null,
        consumptionUsd: null,
        capturedAt: 1,
        source: DAILY_BALANCE_HISTORY_CAPTURE_SOURCES.Refresh,
      },
    },
  },
}

describe("useBalanceHistoryData", () => {
  it("keeps native allowance accounts available for independent original-asset history", async () => {
    const scoped = buildSiteAccount({ id: "old" })
    scoped.account_info.nativeBalance = {
      unit: "USD",
      total: 8,
      permanent: 2,
      daily: 3,
    }
    mocks.accounts.mockResolvedValue([buildSiteAccount({ id: "new" }), scoped])
    mocks.store.mockResolvedValue(beforePrune)
    const { result } = renderHook(() => useBalanceHistoryData([]))
    await act(async () => {})
    expect(result.current.accounts.map((account) => account.id)).toEqual([
      "new",
      "old",
    ])
  })

  beforeEach(() => {
    vi.resetAllMocks()
    mocks.accounts.mockResolvedValue([buildSiteAccount({ id: "new" })])
    mocks.tags.mockResolvedValue({ version: 1, tagsById: {} })
    mocks.store.mockResolvedValue(empty)
    mocks.message.mockResolvedValue({
      success: true,
      data: { success: 1, failed: 0, refreshedCount: 1 },
    })
    mocks.loading.mockReturnValue("pending-toast")
  })
  it("keeps the post-prune snapshot when an older refresh read arrives late", async () => {
    const old = createDeferred<DailyBalanceHistoryStore>()
    mocks.store
      .mockResolvedValueOnce(empty)
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(empty)
    const { result } = renderHook(() => useBalanceHistoryData([]))
    await act(async () => {})
    let refresh!: Promise<void>
    act(() => {
      refresh = result.current.handleRefreshNow()
    })
    await act(async () => {})
    await act(async () => result.current.handlePruneNow())
    await act(async () => {
      old.resolve(beforePrune)
      await refresh
    })
    expect(result.current.store).toEqual(empty)
    expect(mocks.message).toHaveBeenCalledWith(BalanceHistoryMessageTypes.Prune)
    expect(mocks.complete).toHaveBeenCalledTimes(2)
  })

  it("keeps loaded history when a successful response omits capture results", async () => {
    mocks.store.mockResolvedValue(beforePrune)
    mocks.message.mockResolvedValue({ success: true })
    const { result } = renderHook(() => useBalanceHistoryData([]))
    await act(async () => {})
    await act(async () => result.current.handleRefreshNow())
    expect(mocks.error).toHaveBeenCalledWith("messages.error.refreshFailed", {
      id: "pending-toast",
    })
    expect(mocks.success).not.toHaveBeenCalled()
    expect(mocks.store).toHaveBeenCalledOnce()
    expect(result.current.store).toEqual(beforePrune)
  })

  it("warns about uncaptured accounts without claiming full capture success", async () => {
    mocks.message.mockResolvedValue({
      success: true,
      data: { success: 1, failed: 2, refreshedCount: 3 },
    })
    const { result } = renderHook(() => useBalanceHistoryData([]))
    await act(async () => {})
    await act(async () => result.current.handleRefreshNow())
    expect(mocks.warning).toHaveBeenCalledWith(
      "messages.warning.refreshIncomplete",
      { id: "pending-toast" },
    )
    expect(mocks.success).not.toHaveBeenCalled()
    expect(mocks.complete).toHaveBeenCalledWith("failure", expect.any(Object))
    expect(mocks.store).toHaveBeenCalledTimes(2)
  })
  it.each(["success", "failure"])(
    "keeps loading for a newer read after older %s",
    async (outcome) => {
      const old = createDeferred<DailyBalanceHistoryStore>()
      const latest = createDeferred<DailyBalanceHistoryStore>()
      mocks.store
        .mockReturnValueOnce(old.promise)
        .mockReturnValueOnce(latest.promise)
      const { result } = renderHook(() => useBalanceHistoryData([]))
      let prune!: Promise<void>
      act(() => {
        prune = result.current.handlePruneNow()
      })
      await act(async () => {})
      await act(async () => {
        if (outcome === "success") old.resolve(beforePrune)
        else old.reject(new Error("old"))
      })
      expect(result.current.isLoading).toBe(true)
      expect(result.current.store).toBeNull()
      await act(async () => {
        latest.resolve(empty)
        await prune
      })
      expect(result.current.store).toEqual(empty)
    },
  )
  it("retains the previous chart snapshot when the current load fails", async () => {
    mocks.store
      .mockResolvedValueOnce(beforePrune)
      .mockRejectedValueOnce(new Error("read failed"))
    const { result } = renderHook(() => useBalanceHistoryData([]))
    await act(async () => {})
    await act(async () => result.current.handlePruneNow())
    expect(result.current.store).toEqual(beforePrune)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.loadError).toBe("read failed")
    expect(result.current.hasLoadedData).toBe(true)
  })

  it("exposes an initial history read error without a message", async () => {
    mocks.store.mockRejectedValueOnce(new Error(""))
    const { result } = renderHook(() => useBalanceHistoryData([]))
    await act(async () => {})

    expect(result.current.loadError).toBeTruthy()
    expect(result.current.hasLoadedData).toBe(false)
  })

  it("exposes an initial history read error and clears it only after a successful retry", async () => {
    mocks.store
      .mockRejectedValueOnce(new Error("unsupported_balance_history_version"))
      .mockResolvedValueOnce(empty)
    const { result } = renderHook(() => useBalanceHistoryData([]))
    await act(async () => {})
    expect(result.current.store).toBeNull()
    expect(result.current.loadError).toBe("unsupported_balance_history_version")
    expect(result.current.hasLoadedData).toBe(false)
    await act(async () => result.current.retryLoad())
    expect(result.current.loadError).toBeNull()
    expect(result.current.hasLoadedData).toBe(true)
    expect(result.current.store).toEqual(empty)
  })
  it.each(["success", "failure"])(
    "finishes admitted commands after unmount without new reads or feedback: %s",
    async (outcome) => {
      const pending = createDeferred<{ success: boolean }>()
      mocks.message.mockReturnValueOnce(pending.promise)
      const { result, unmount } = renderHook(() => useBalanceHistoryData([]))
      await act(async () => {})
      let prune!: Promise<void>
      act(() => {
        prune = result.current.handlePruneNow()
      })
      unmount()
      await act(async () => {
        if (outcome === "success") pending.resolve({ success: true })
        else pending.reject(new Error("failed"))
        await prune
      })
      expect(mocks.store).toHaveBeenCalledOnce()
      expect(mocks.success).not.toHaveBeenCalled()
      expect(mocks.error).not.toHaveBeenCalled()
      expect(mocks.dismiss).toHaveBeenCalledWith("pending-toast")
      expect(mocks.complete).toHaveBeenCalledOnce()
    },
  )
})
