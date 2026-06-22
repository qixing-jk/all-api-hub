import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { useInvalidKeyDeletion } from "~/features/KeyManagement/components/useInvalidKeyDeletion"
import {
  AccountKeyRepairMessageTypes,
  sendAccountKeyRepairMessage,
} from "~/services/accounts/accountKeyAutoProvisioning/messaging"
import {
  ACCOUNT_KEY_REPAIR_INVALID_TOKEN_REASONS,
  ACCOUNT_KEY_REPAIR_JOB_STATES,
  ACCOUNT_KEY_REPAIR_OUTCOMES,
  type AccountKeyRepairInvalidToken,
  type AccountKeyRepairProgress,
} from "~/types/accountKeyAutoProvisioning"
import { testI18n } from "~~/tests/test-utils/i18n"

vi.mock("~/services/accounts/accountKeyAutoProvisioning/messaging", () => ({
  AccountKeyRepairMessageTypes: {
    Start: "accountKeyRepair:start",
    GetProgress: "accountKeyRepair:getProgress",
    DeleteInvalidTokens: "accountKeyRepair:deleteInvalidTokens",
  },
  sendAccountKeyRepairMessage: vi.fn(),
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  trackProductAnalyticsActionCompleted: vi.fn(),
  trackProductAnalyticsActionStarted: vi.fn(),
}))

const sendAccountKeyRepairMessageMock = vi.mocked(sendAccountKeyRepairMessage)

function createInvalidToken(
  overrides: Partial<AccountKeyRepairInvalidToken>,
): AccountKeyRepairInvalidToken {
  return {
    accountId: "account-1",
    accountName: "Account 1",
    siteType: SITE_TYPES.NEW_API,
    siteUrlOrigin: "https://one.example.invalid",
    tokenId: 1,
    tokenName: "Token 1",
    group: "default",
    reason: ACCOUNT_KEY_REPAIR_INVALID_TOKEN_REASONS.GroupUnavailable,
    ...overrides,
  }
}

function createProgress(
  invalidTokens: AccountKeyRepairInvalidToken[],
): AccountKeyRepairProgress {
  return {
    jobId: "job-1",
    state: ACCOUNT_KEY_REPAIR_JOB_STATES.Completed,
    totals: {
      enabledAccounts: 1,
      eligibleAccounts: 1,
      processedAccounts: 1,
    },
    summary: {
      created: 0,
      alreadyHad: 0,
      skipped: 0,
      failed: 0,
      invalidKeys: invalidTokens.length,
    },
    results: [
      {
        accountId: "account-1",
        accountName: "Account 1",
        siteType: SITE_TYPES.NEW_API,
        siteUrlOrigin: "https://one.example.invalid",
        outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.AlreadyHad,
        invalidTokens,
        finishedAt: 1,
      },
    ],
  }
}

describe("useInvalidKeyDeletion", () => {
  const visibleToken = createInvalidToken({
    tokenId: 1,
    tokenName: "Visible token",
  })
  const hiddenToken = createInvalidToken({
    tokenId: 2,
    tokenName: "Hidden token",
    group: "hidden",
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("deletes selected invalid tokens even when filters hide some selections", async () => {
    sendAccountKeyRepairMessageMock.mockResolvedValue({
      success: true,
      data: {
        deleted: [
          { ...visibleToken, deletedAt: 1 },
          { ...hiddenToken, deletedAt: 1 },
        ],
        failed: [],
      },
    })
    let progress = createProgress([visibleToken, hiddenToken])
    const setProgress = vi.fn((updater) => {
      progress = typeof updater === "function" ? updater(progress) : updater
    })

    const { result } = renderHook(() =>
      useInvalidKeyDeletion({
        invalidTokens: [visibleToken, hiddenToken],
        setProgress,
        t: testI18n.t,
      }),
    )

    act(() => {
      result.current.setSelectedInvalidTokenKeys(
        new Set(["account-1:1", "account-1:2"]),
      )
    })

    await act(async () => {
      await result.current.handleDeleteInvalidKeys()
    })

    expect(sendAccountKeyRepairMessageMock).toHaveBeenCalledWith(
      AccountKeyRepairMessageTypes.DeleteInvalidTokens,
      { tokens: [visibleToken, hiddenToken] },
    )
    expect(progress.summary.invalidKeys).toBe(0)
    expect(progress.summary.deletedKeys).toBe(2)
  })

  it("skips deletion when no invalid tokens are selected", async () => {
    const setProgress = vi.fn()

    const { result } = renderHook(() =>
      useInvalidKeyDeletion({
        invalidTokens: [visibleToken],
        setProgress,
        t: testI18n.t,
      }),
    )

    await act(async () => {
      await result.current.handleDeleteInvalidKeys()
    })

    expect(sendAccountKeyRepairMessageMock).not.toHaveBeenCalled()
    expect(setProgress).not.toHaveBeenCalled()
    expect(result.current.isDeletingInvalidKeys).toBe(false)
  })

  it("ignores repeated delete submissions while a delete request is in flight", async () => {
    let resolveDelete:
      | ((
          value: Awaited<ReturnType<typeof sendAccountKeyRepairMessage>>,
        ) => void)
      | undefined
    sendAccountKeyRepairMessageMock.mockReturnValue(
      new Promise((resolve) => {
        resolveDelete = resolve
      }) as ReturnType<typeof sendAccountKeyRepairMessage>,
    )
    const setProgress = vi.fn()

    const { result } = renderHook(() =>
      useInvalidKeyDeletion({
        invalidTokens: [visibleToken],
        setProgress,
        t: testI18n.t,
      }),
    )

    act(() => {
      result.current.setSelectedInvalidTokenKeys(new Set(["account-1:1"]))
    })

    void act(() => {
      void result.current.handleDeleteInvalidKeys()
    })
    await waitFor(() => {
      expect(result.current.isDeletingInvalidKeys).toBe(true)
    })

    await act(async () => {
      await result.current.handleDeleteInvalidKeys()
    })

    expect(sendAccountKeyRepairMessageMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveDelete?.({
        success: true,
        data: { deleted: [{ ...visibleToken, deletedAt: 1 }], failed: [] },
      })
    })
  })
})
