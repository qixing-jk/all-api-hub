import { renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { useRepairCreatedKeyManagedSiteImport } from "~/features/KeyManagement/components/RepairMissingKeysDialog/useRepairCreatedKeyManagedSiteImport"
import { AccountKeyRepairMessageTypes } from "~/services/accounts/accountKeyAutoProvisioning/messaging"
import {
  ACCOUNT_KEY_RECONCILIATION_INVENTORY_STATUSES,
  ACCOUNT_KEY_RECONCILIATION_OUTCOMES,
} from "~/services/accounts/accountKeyInventoryReconciliation"
import { buildAccountKeyResourceRuntimeKey } from "~/services/accounts/accountRuntimeKeys"
import {
  ACCOUNT_KEY_REQUIREMENT_PROVISIONING_KINDS,
  type AccountKeyResourceRef,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { AuthTypeEnum, type DisplaySiteData } from "~/types"
import {
  ACCOUNT_KEY_REPAIR_JOB_STATES,
  ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES,
  ACCOUNT_KEY_REPAIR_OUTCOMES,
  ACCOUNT_KEY_REPAIR_PROGRESS_SCHEMA_VERSION,
  type AccountKeyRepairProgress,
} from "~/types/accountKeyAutoProvisioning"
import {
  MANAGED_SITE_TOKEN_BATCH_EXPORT_EXECUTION_RESULTS,
  MANAGED_SITE_TOKEN_BATCH_EXPORT_INPUT_KINDS,
  MANAGED_SITE_TOKEN_BATCH_IMPORT_SOURCES,
  MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS,
} from "~/types/managedSiteTokenBatchExport"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"
import { testI18n } from "~~/tests/test-utils/i18n"
import { act, waitFor } from "~~/tests/test-utils/render"

const mocks = vi.hoisted(() => ({
  getCurrentManagedSiteRuntimeConfig: vi.fn(),
  createManagedSiteTokenBatchImportTarget: vi.fn(),
  resolveRepairCreatedKeyBatchImportCandidate: vi.fn(),
  sendAccountKeyRepairMessage: vi.fn(),
}))

vi.mock("~/services/managedSites/runtimeConfig", () => ({
  getCurrentManagedSiteRuntimeConfig: mocks.getCurrentManagedSiteRuntimeConfig,
}))

vi.mock("~/services/managedSites/tokenBatchImportTarget", () => ({
  createManagedSiteTokenBatchImportTarget:
    mocks.createManagedSiteTokenBatchImportTarget,
}))

vi.mock("~/services/managedSites/repairCreatedKeyBatchImport", async () => {
  const actual = await vi.importActual<
    typeof import("~/services/managedSites/repairCreatedKeyBatchImport")
  >("~/services/managedSites/repairCreatedKeyBatchImport")
  return {
    ...actual,
    resolveRepairCreatedKeyBatchImportCandidate:
      mocks.resolveRepairCreatedKeyBatchImportCandidate,
  }
})

vi.mock(
  "~/services/accounts/accountKeyAutoProvisioning/messaging",
  async () => {
    const actual = await vi.importActual<
      typeof import("~/services/accounts/accountKeyAutoProvisioning/messaging")
    >("~/services/accounts/accountKeyAutoProvisioning/messaging")
    return {
      ...actual,
      sendAccountKeyRepairMessage: mocks.sendAccountKeyRepairMessage,
    }
  },
)

const createAccount = (): DisplaySiteData =>
  buildDisplaySiteData({
    id: "account-1",
    name: "Example Account",
    siteType: SITE_TYPES.NEW_API,
    baseUrl: "https://account.example.invalid",
    authType: AuthTypeEnum.AccessToken,
    userId: "user-1",
    token: "account-access-token",
  })

const createProgress = (
  account: DisplaySiteData,
  ref: AccountKeyResourceRef,
): AccountKeyRepairProgress => ({
  schemaVersion: ACCOUNT_KEY_REPAIR_PROGRESS_SCHEMA_VERSION,
  jobId: "repair-job",
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
    requirements: 1,
    coveredRequirements: 0,
    createdRequirements: 1,
    blockedRequirements: 0,
    rejectedRequirements: 0,
    uncertainRequirements: 0,
    invalidResources: 0,
    renameApplied: 0,
    renameRejected: 0,
    renameUncertain: 0,
    deleteApplied: 0,
    deleteRejected: 0,
    deleteUncertain: 0,
  },
  results: [
    {
      accountId: account.id,
      accountName: account.name,
      siteType: account.siteType,
      siteUrlOrigin: new URL(account.baseUrl).origin,
      outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Repaired,
      inventoryStatus: ACCOUNT_KEY_RECONCILIATION_INVENTORY_STATUSES.Complete,
      requirementResults: [
        {
          requirement: {
            requirementKey: "requirement-1",
            displayName: "Created key",
            provisioning: {
              kind: ACCOUNT_KEY_REQUIREMENT_PROVISIONING_KINDS.Automatic,
            },
          },
          outcome: ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Created,
          created: { ref },
        },
      ],
      createdRefs: [ref],
      invalidResources: [],
      renameResults: [],
      finishedAt: 1,
    },
  ],
})

describe("useRepairCreatedKeyManagedSiteImport", () => {
  it("counts an exact current-schema created ref as attemptable", () => {
    const account = createAccount()
    const ref: AccountKeyResourceRef = {
      accountId: account.id,
      siteType: account.siteType,
      scopeKey: "scope-a",
      resourceId: "resource-1",
    }
    const { result } = renderHook(() =>
      useRepairCreatedKeyManagedSiteImport({
        accounts: [account],
        isOpen: true,
        isCurrentSessionResult: true,
        managedSiteType: SITE_TYPES.NEW_API,
        progress: createProgress(account, ref),
        setProgress: vi.fn(),
        t: testI18n.t,
      }),
    )

    expect(result.current.createdReferenceCount).toBe(1)
  })

  it.each([
    {
      name: "account identity",
      ref: {
        accountId: "other-account",
        siteType: SITE_TYPES.NEW_API,
        scopeKey: "scope-a",
        resourceId: "resource-1",
      },
    },
    {
      name: "site type",
      ref: {
        accountId: "account-1",
        siteType: SITE_TYPES.ONE_API,
        scopeKey: "scope-a",
        resourceId: "resource-1",
      },
    },
  ])("discards a created ref with mismatched $name", ({ ref }) => {
    const account = createAccount()
    const { result } = renderHook(() =>
      useRepairCreatedKeyManagedSiteImport({
        accounts: [account],
        isOpen: true,
        isCurrentSessionResult: true,
        managedSiteType: SITE_TYPES.NEW_API,
        progress: createProgress(account, ref),
        setProgress: vi.fn(),
        t: testI18n.t,
      }),
    )

    expect(result.current.createdReferenceCount).toBe(0)
  })

  it("records completed imports with the exact resource ref", async () => {
    const account = createAccount()
    const ref: AccountKeyResourceRef = {
      accountId: account.id,
      siteType: account.siteType,
      scopeKey: "scope-a",
      resourceId: "resource-1",
    }
    const progress = createProgress(account, ref)
    const runtimeKey = buildAccountKeyResourceRuntimeKey(account, {
      ref,
      label: "Created key",
      secret: "resolved-runtime-secret",
    })
    mocks.getCurrentManagedSiteRuntimeConfig.mockResolvedValue({
      siteType: SITE_TYPES.NEW_API,
      config: { baseUrl: "https://target.example.invalid" },
    })
    mocks.createManagedSiteTokenBatchImportTarget.mockResolvedValue({
      targetFingerprint: "a".repeat(64),
    })
    mocks.resolveRepairCreatedKeyBatchImportCandidate.mockResolvedValue({
      items: [
        {
          kind: MANAGED_SITE_TOKEN_BATCH_EXPORT_INPUT_KINDS.RESOLVED,
          account,
          runtimeKey,
        },
      ],
      intent: {
        source: MANAGED_SITE_TOKEN_BATCH_IMPORT_SOURCES.REPAIR_CREATED,
        verification: MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS.TRUSTED_NEW,
      },
    })
    mocks.sendAccountKeyRepairMessage.mockResolvedValue({
      success: true,
      data: progress,
    })
    const { result } = renderHook(() =>
      useRepairCreatedKeyManagedSiteImport({
        accounts: [account],
        isOpen: true,
        isCurrentSessionResult: true,
        managedSiteType: SITE_TYPES.NEW_API,
        progress,
        setProgress: vi.fn(),
        t: testI18n.t,
      }),
    )

    await act(async () => {
      await result.current.openBatchImport()
    })
    act(() => {
      result.current.handleBatchImportCompleted({
        totalSelected: 1,
        attemptedCount: 1,
        createdCount: 1,
        failedCount: 0,
        uncertainCount: 0,
        skippedCount: 0,
        items: [
          {
            id: runtimeKey.id,
            accountName: account.name,
            runtimeKeyName: runtimeKey.label,
            result: MANAGED_SITE_TOKEN_BATCH_EXPORT_EXECUTION_RESULTS.CREATED,
            success: true,
            skipped: false,
          },
        ],
      })
    })

    await waitFor(() => {
      expect(mocks.sendAccountKeyRepairMessage).toHaveBeenCalledWith(
        AccountKeyRepairMessageTypes.RecordManagedSiteImportResults,
        {
          jobId: progress.jobId,
          targetFingerprint: "a".repeat(64),
          items: [
            {
              resourceRef: ref,
              status: ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES.Created,
            },
          ],
        },
      )
    })
  })
})
