import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { getInvalidResourceKey } from "~/features/KeyManagement/components/RepairMissingKeysDialog/repairMissingKeysDialogHelpers"
import { useInvalidKeyDeletion } from "~/features/KeyManagement/components/RepairMissingKeysDialog/useInvalidKeyDeletion"
import {
  AccountKeyRepairMessageTypes,
  sendAccountKeyRepairMessage,
} from "~/services/accounts/accountKeyAutoProvisioning/messaging"
import type {
  AccountKeyRepairInvalidResource,
  AccountKeyRepairProgress,
} from "~/types/accountKeyAutoProvisioning"
import {
  ACCOUNT_KEY_REPAIR_JOB_STATES,
  ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES,
  ACCOUNT_KEY_REPAIR_OUTCOMES,
  ACCOUNT_KEY_REPAIR_PROGRESS_SCHEMA_VERSION,
} from "~/types/accountKeyAutoProvisioning"
import { testI18n } from "~~/tests/test-utils/i18n"

vi.mock("~/services/accounts/accountKeyAutoProvisioning/messaging", () => ({
  AccountKeyRepairMessageTypes: {
    Start: "accountKeyRepair:start",
    GetProgress: "accountKeyRepair:getProgress",
    DeleteInvalidResources: "accountKeyRepair:deleteInvalidResources",
  },
  sendAccountKeyRepairMessage: vi.fn(),
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  trackProductAnalyticsActionCompleted: vi.fn(),
  trackProductAnalyticsActionStarted: vi.fn(),
}))

const sendAccountKeyRepairMessageMock = vi.mocked(sendAccountKeyRepairMessage)

function createInvalidResource(
  resourceId: string,
  overrides: Partial<AccountKeyRepairInvalidResource> = {},
): AccountKeyRepairInvalidResource {
  return {
    accountId: "account-1",
    accountName: "Account 1",
    siteType: SITE_TYPES.NEW_API,
    siteUrlOrigin: "https://one.example.invalid",
    ref: {
      accountId: "account-1",
      siteType: SITE_TYPES.NEW_API,
      scopeKey: "account",
      resourceId,
    },
    displayLabel: `Key ${resourceId}`,
    reason: "orphaned-placement",
    ...overrides,
  }
}

function createProgress(
  invalidResources: AccountKeyRepairInvalidResource[],
): AccountKeyRepairProgress {
  return {
    schemaVersion: ACCOUNT_KEY_REPAIR_PROGRESS_SCHEMA_VERSION,
    jobId: "job-1",
    state: ACCOUNT_KEY_REPAIR_JOB_STATES.Completed,
    totals: {
      enabledAccounts: 1,
      eligibleAccounts: 1,
      processedAccounts: 1,
    },
    summary: {
      complete: 1,
      partial: 0,
      blocked: 0,
      skipped: 0,
      failed: 0,
      requirements: 0,
      coveredRequirements: 0,
      createdRequirements: 0,
      blockedRequirements: 0,
      rejectedRequirements: 0,
      uncertainRequirements: 0,
      invalidResources: invalidResources.length,
      renameApplied: 0,
      renameRejected: 0,
      renameUncertain: 0,
      deleteApplied: 0,
      deleteRejected: 0,
      deleteUncertain: 0,
    },
    results: [
      {
        accountId: "account-1",
        accountName: "Account 1",
        siteType: SITE_TYPES.NEW_API,
        siteUrlOrigin: "https://one.example.invalid",
        outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Covered,
        requirementResults: [],
        createdRefs: [],
        invalidResources,
        renameResults: [],
        finishedAt: 1,
      },
    ],
  }
}

describe("useInvalidKeyDeletion", () => {
  const appliedResource = createInvalidResource("applied")
  const rejectedResource = createInvalidResource("rejected")
  const uncertainResource = createInvalidResource("uncertain")

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("removes only applied resources and preserves rejected or uncertain rows", async () => {
    sendAccountKeyRepairMessageMock.mockResolvedValue({
      success: true,
      data: {
        results: [
          {
            resource: appliedResource,
            outcome: ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES.Applied,
            finishedAt: 1,
          },
          {
            resource: rejectedResource,
            outcome: ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES.Rejected,
            failure: { code: "unexpected", message: "Delete rejected" },
            finishedAt: 1,
          },
          {
            resource: uncertainResource,
            outcome: ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES.Uncertain,
            failure: { code: "mutation_state_uncertain" },
            finishedAt: 1,
          },
        ],
      },
    })
    let progress = createProgress([
      appliedResource,
      rejectedResource,
      uncertainResource,
    ])
    const setProgress = vi.fn((updater) => {
      progress = typeof updater === "function" ? updater(progress) : updater
    })

    const { result } = renderHook(() =>
      useInvalidKeyDeletion({
        invalidResources: [
          appliedResource,
          rejectedResource,
          uncertainResource,
        ],
        setProgress,
        t: testI18n.t,
      }),
    )

    act(() => {
      result.current.setSelectedInvalidResourceKeys(
        new Set(
          [appliedResource, rejectedResource, uncertainResource].map(
            getInvalidResourceKey,
          ),
        ),
      )
    })

    await act(async () => {
      await result.current.handleDeleteInvalidResources()
    })

    expect(sendAccountKeyRepairMessageMock).toHaveBeenCalledWith(
      AccountKeyRepairMessageTypes.DeleteInvalidResources,
      {
        resources: [appliedResource, rejectedResource, uncertainResource],
      },
    )
    expect(progress.results[0].invalidResources).toEqual([
      rejectedResource,
      uncertainResource,
    ])
    expect(progress.summary).toMatchObject({
      invalidResources: 2,
      deleteApplied: 1,
      deleteRejected: 1,
      deleteUncertain: 1,
    })
    expect(result.current.selectedInvalidResources).toEqual([
      rejectedResource,
      uncertainResource,
    ])
    expect(result.current.deleteResultMessage).not.toBe("")
  })

  it("skips deletion when no invalid resources are selected", async () => {
    const setProgress = vi.fn()
    const { result } = renderHook(() =>
      useInvalidKeyDeletion({
        invalidResources: [appliedResource],
        setProgress,
        t: testI18n.t,
      }),
    )

    await act(async () => {
      await result.current.handleDeleteInvalidResources()
    })

    expect(sendAccountKeyRepairMessageMock).not.toHaveBeenCalled()
    expect(setProgress).not.toHaveBeenCalled()
    expect(result.current.isDeletingInvalidResources).toBe(false)
  })

  it("ignores repeated delete submissions while a request is in flight", async () => {
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
        invalidResources: [appliedResource],
        setProgress,
        t: testI18n.t,
      }),
    )

    act(() => {
      result.current.setSelectedInvalidResourceKeys(
        new Set([getInvalidResourceKey(appliedResource)]),
      )
    })

    void act(() => {
      void result.current.handleDeleteInvalidResources()
    })
    await waitFor(() => {
      expect(result.current.isDeletingInvalidResources).toBe(true)
    })
    await act(async () => {
      await result.current.handleDeleteInvalidResources()
    })

    expect(sendAccountKeyRepairMessageMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveDelete?.({
        success: true,
        data: {
          results: [
            {
              resource: appliedResource,
              outcome: ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES.Applied,
              finishedAt: 1,
            },
          ],
        },
      })
    })
  })
})
