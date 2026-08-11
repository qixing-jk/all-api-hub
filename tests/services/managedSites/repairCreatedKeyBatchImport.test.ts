import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  ACCOUNT_KEY_RECONCILIATION_INVENTORY_STATUSES,
  ACCOUNT_KEY_RECONCILIATION_OUTCOMES,
} from "~/services/accounts/accountKeyInventoryReconciliation"
import {
  buildAccountKeyResourceRuntimeKeyId,
  isAccountKeyResourceRuntimeKey,
  type AccountKeyResourceRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
import {
  ACCOUNT_KEY_REQUIREMENT_PROVISIONING_KINDS,
  ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS,
  type AccountKeyResourceRef,
  type AccountKeyResourceSession,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { RESOURCE_FAILURE_CODES } from "~/services/apiAdapters/contracts/resourceNative"
import {
  getRepairCreatedKeyBatchImportAbsenceReason,
  REPAIR_CREATED_KEY_BATCH_IMPORT_ABSENCE_REASONS,
  REPAIR_CREATED_KEY_BATCH_IMPORT_FRESHNESS,
  resolveRepairCreatedKeyBatchImportCandidate,
} from "~/services/managedSites/repairCreatedKeyBatchImport"
import { AuthTypeEnum, type DisplaySiteData } from "~/types"
import {
  ACCOUNT_KEY_REPAIR_JOB_STATES,
  ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES,
  ACCOUNT_KEY_REPAIR_OUTCOMES,
  ACCOUNT_KEY_REPAIR_PROGRESS_SCHEMA_VERSION,
  type AccountKeyRepairProgress,
} from "~/types/accountKeyAutoProvisioning"
import {
  isBlockedManagedSiteTokenBatchExportItemInput,
  isResolvedManagedSiteTokenBatchExportItemInput,
  MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_DETAIL_CODES,
  MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS,
} from "~/types/managedSiteTokenBatchExport"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"

const mocks = vi.hoisted(() => ({
  createDisplayAccountApiContext: vi.fn(),
  resolveRepairCreatedRuntimeSecret: vi.fn(),
}))

vi.mock("~/services/accounts/utils/apiServiceRequest", () => ({
  createDisplayAccountApiContext: mocks.createDisplayAccountApiContext,
}))

vi.mock(
  "~/services/accounts/accountKeyAutoProvisioning/repairCreatedRuntimeSecrets",
  () => ({
    resolveRepairCreatedRuntimeSecret: mocks.resolveRepairCreatedRuntimeSecret,
  }),
)

const TARGET_A = "a".repeat(64)

const createAccount = (
  overrides: Partial<DisplaySiteData> = {},
): DisplaySiteData =>
  buildDisplaySiteData({
    id: "account-1",
    name: "Example Account",
    siteType: SITE_TYPES.NEW_API,
    baseUrl: "https://account.example.invalid",
    authType: AuthTypeEnum.AccessToken,
    userId: "user-1",
    token: "account-access-token",
    ...overrides,
  })

const createRef = (
  overrides: Partial<AccountKeyResourceRef> = {},
): AccountKeyResourceRef => ({
  accountId: "account-1",
  siteType: SITE_TYPES.NEW_API,
  scopeKey: "scope-a",
  resourceId: "resource-1",
  ...overrides,
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

const createSession = (
  resolve: ReturnType<typeof vi.fn>,
): AccountKeyResourceSession => ({
  runtimeKey: { resolve },
  resolveDefaultScope: vi.fn(),
  listScopes: vi.fn(),
  openCollection: vi.fn(),
  openCreateEditor: vi.fn(),
})

describe("resolveRepairCreatedKeyBatchImportCandidate", () => {
  beforeEach(() => {
    mocks.createDisplayAccountApiContext.mockReset()
    mocks.resolveRepairCreatedRuntimeSecret.mockReset()
    mocks.resolveRepairCreatedRuntimeSecret.mockResolvedValue(null)
  })

  it("resolves an exact current-schema created ref through the current native session", async () => {
    const account = createAccount()
    const ref = createRef()
    const resolve = vi.fn().mockResolvedValue({
      kind: ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS.Resolved,
      secret: "resolved-runtime-secret",
    })
    const open = vi.fn().mockResolvedValue(createSession(resolve))
    mocks.createDisplayAccountApiContext.mockReturnValue({
      request: { baseUrl: account.baseUrl },
      capabilities: {
        account: { keyResources: { open } },
      },
    })

    const candidate = await resolveRepairCreatedKeyBatchImportCandidate({
      progress: createProgress(account, ref),
      accounts: [account],
      targetFingerprint: TARGET_A,
      freshness: REPAIR_CREATED_KEY_BATCH_IMPORT_FRESHNESS.CURRENT_SESSION,
    })

    expect(candidate?.intent.verification).toBe(
      MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS.TRUSTED_NEW,
    )
    const resolvedItems =
      candidate?.items.filter(isResolvedManagedSiteTokenBatchExportItemInput) ??
      []
    expect(resolvedItems).toHaveLength(1)
    const runtimeKey = resolvedItems[0]
      .runtimeKey as AccountKeyResourceRuntimeKey
    expect(isAccountKeyResourceRuntimeKey(runtimeKey)).toBe(true)
    expect(runtimeKey).toMatchObject({
      accountId: account.id,
      label: "Created key",
      resourceRef: ref,
      secret: "resolved-runtime-secret",
    })
    expect(open).toHaveBeenCalledWith({
      account: {
        id: account.id,
        name: account.name,
        siteType: account.siteType,
      },
      request: { baseUrl: account.baseUrl },
    })
    expect(resolve).toHaveBeenCalledWith(ref)
  })

  it("uses the current repair job's transient created secret before opening a session", async () => {
    const account = createAccount()
    const ref = createRef()
    mocks.resolveRepairCreatedRuntimeSecret.mockResolvedValueOnce(
      "transient-created-secret",
    )

    const candidate = await resolveRepairCreatedKeyBatchImportCandidate({
      progress: createProgress(account, ref),
      accounts: [account],
      targetFingerprint: TARGET_A,
      freshness: REPAIR_CREATED_KEY_BATCH_IMPORT_FRESHNESS.CURRENT_SESSION,
    })

    expect(mocks.resolveRepairCreatedRuntimeSecret).toHaveBeenCalledWith(
      "repair-job",
      ref,
    )
    expect(candidate?.items).toEqual([
      expect.objectContaining({
        kind: "resolved",
        runtimeKey: expect.objectContaining({
          resourceRef: ref,
          secret: "transient-created-secret",
        }),
      }),
    ])
    expect(mocks.createDisplayAccountApiContext).not.toHaveBeenCalled()
  })

  it("does not reuse transient created secrets for historical repair results", async () => {
    const account = createAccount()
    const ref = createRef()
    mocks.resolveRepairCreatedRuntimeSecret.mockResolvedValueOnce(
      "transient-created-secret",
    )
    const resolve = vi.fn().mockResolvedValue({
      kind: ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS.Resolved,
      secret: "historical-runtime-secret",
    })
    const open = vi.fn().mockResolvedValue(createSession(resolve))
    mocks.createDisplayAccountApiContext.mockReturnValue({
      request: { baseUrl: account.baseUrl },
      capabilities: {
        account: { keyResources: { open } },
      },
    })

    const candidate = await resolveRepairCreatedKeyBatchImportCandidate({
      progress: createProgress(account, ref),
      accounts: [account],
      targetFingerprint: TARGET_A,
      freshness: REPAIR_CREATED_KEY_BATCH_IMPORT_FRESHNESS.HISTORICAL,
    })

    expect(mocks.resolveRepairCreatedRuntimeSecret).not.toHaveBeenCalled()
    expect(resolve).toHaveBeenCalledWith(ref)
    expect(candidate?.intent.verification).toBe(
      MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS.COMPLETE,
    )
    expect(candidate?.items).toEqual([
      expect.objectContaining({
        kind: "resolved",
        runtimeKey: expect.objectContaining({
          resourceRef: ref,
          secret: "historical-runtime-secret",
        }),
      }),
    ])
  })

  it("keeps a context-construction failure visible as a blocked ref", async () => {
    const account = createAccount()
    const ref = createRef()
    mocks.createDisplayAccountApiContext.mockImplementation(() => {
      throw new Error("stored account request is no longer usable")
    })

    const candidate = await resolveRepairCreatedKeyBatchImportCandidate({
      progress: createProgress(account, ref),
      accounts: [account],
      targetFingerprint: TARGET_A,
      freshness: REPAIR_CREATED_KEY_BATCH_IMPORT_FRESHNESS.CURRENT_SESSION,
    })

    const blockedItems =
      candidate?.items.filter(isBlockedManagedSiteTokenBatchExportItemInput) ??
      []
    expect(blockedItems).toEqual([
      expect.objectContaining({
        accountLabel: account.name,
        keyLabel: "Created key",
        blockingDetailCode:
          MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_DETAIL_CODES.SOURCE_KEY_INVENTORY_UNAVAILABLE,
      }),
    ])
  })

  it("blocks unavailable and blank runtime secrets without substituting another ref", async () => {
    const account = createAccount()
    const unavailableRef = createRef({ resourceId: "unavailable" })
    const blankRef = createRef({ resourceId: "blank" })
    const progress = createProgress(account, unavailableRef)
    progress.results[0].requirementResults = [
      progress.results[0].requirementResults[0],
      {
        requirement: {
          requirementKey: "requirement-2",
          displayName: "Blank key",
          provisioning: {
            kind: ACCOUNT_KEY_REQUIREMENT_PROVISIONING_KINDS.Automatic,
          },
        },
        outcome: ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Created,
        created: { ref: blankRef },
      },
    ]
    progress.results[0].createdRefs = [unavailableRef, blankRef]
    const resolve = vi.fn(async (ref: AccountKeyResourceRef) =>
      ref.resourceId === "blank"
        ? {
            kind: ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS.Resolved,
            secret: "   ",
          }
        : { kind: ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS.Unavailable },
    )
    mocks.createDisplayAccountApiContext.mockReturnValue({
      request: { baseUrl: account.baseUrl },
      capabilities: {
        account: {
          keyResources: {
            open: vi.fn().mockResolvedValue(createSession(resolve)),
          },
        },
      },
    })

    const candidate = await resolveRepairCreatedKeyBatchImportCandidate({
      progress,
      accounts: [account],
      targetFingerprint: TARGET_A,
      freshness: REPAIR_CREATED_KEY_BATCH_IMPORT_FRESHNESS.CURRENT_SESSION,
    })

    const blockedItems =
      candidate?.items.filter(isBlockedManagedSiteTokenBatchExportItemInput) ??
      []
    expect(blockedItems).toHaveLength(2)
    expect(blockedItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          keyLabel: "Created key",
          blockingDetailCode:
            MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_DETAIL_CODES.CREATED_KEY_UNAVAILABLE,
        }),
        expect.objectContaining({
          keyLabel: "Blank key",
          blockingDetailCode:
            MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_DETAIL_CODES.CREATED_KEY_UNAVAILABLE,
        }),
      ]),
    )
  })

  it("deduplicates by full ref identity and excludes non-created outcomes", async () => {
    const account = createAccount()
    const firstRef = createRef()
    const otherScopeRef = createRef({ scopeKey: "scope-b" })
    const progress = createProgress(account, firstRef)
    progress.results[0].outcome = ACCOUNT_KEY_REPAIR_OUTCOMES.Partial
    progress.results[0].requirementResults = [
      progress.results[0].requirementResults[0],
      {
        requirement: {
          requirementKey: "duplicate",
          displayName: "Duplicate",
          provisioning: {
            kind: ACCOUNT_KEY_REQUIREMENT_PROVISIONING_KINDS.Automatic,
          },
        },
        outcome: ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Created,
        created: { ref: firstRef },
      },
      {
        requirement: {
          requirementKey: "other-scope",
          displayName: "Other scope",
          provisioning: {
            kind: ACCOUNT_KEY_REQUIREMENT_PROVISIONING_KINDS.Automatic,
          },
        },
        outcome: ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Created,
        created: { ref: otherScopeRef },
      },
      {
        requirement: {
          requirementKey: "uncertain-covered",
          displayName: "Uncertain covered",
          provisioning: {
            kind: ACCOUNT_KEY_REQUIREMENT_PROVISIONING_KINDS.Automatic,
          },
        },
        outcome: ACCOUNT_KEY_RECONCILIATION_OUTCOMES.CoveredAfterUncertain,
        failure: {
          code: RESOURCE_FAILURE_CODES.MutationStateUncertain,
        },
      },
      {
        requirement: {
          requirementKey: "rejected",
          displayName: "Rejected",
          provisioning: {
            kind: ACCOUNT_KEY_REQUIREMENT_PROVISIONING_KINDS.Automatic,
          },
        },
        outcome: ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Rejected,
        failure: { code: RESOURCE_FAILURE_CODES.UpstreamRejected },
      },
      {
        requirement: {
          requirementKey: "uncertain",
          displayName: "Uncertain",
          provisioning: {
            kind: ACCOUNT_KEY_REQUIREMENT_PROVISIONING_KINDS.Automatic,
          },
        },
        outcome: ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Uncertain,
        failure: {
          code: RESOURCE_FAILURE_CODES.MutationStateUncertain,
        },
      },
    ]
    progress.results[0].createdRefs = [firstRef, otherScopeRef]
    const resolve = vi.fn(async (ref: AccountKeyResourceRef) => ({
      kind: ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS.Resolved,
      secret: `secret-${ref.scopeKey}`,
    }))
    const open = vi.fn().mockResolvedValue(createSession(resolve))
    mocks.createDisplayAccountApiContext.mockReturnValue({
      request: { baseUrl: account.baseUrl },
      capabilities: {
        account: {
          keyResources: { open },
        },
      },
    })

    const candidate = await resolveRepairCreatedKeyBatchImportCandidate({
      progress,
      accounts: [account],
      targetFingerprint: TARGET_A,
      freshness: REPAIR_CREATED_KEY_BATCH_IMPORT_FRESHNESS.CURRENT_SESSION,
    })

    const resolvedItems =
      candidate?.items.filter(isResolvedManagedSiteTokenBatchExportItemInput) ??
      []
    expect(resolvedItems).toHaveLength(2)
    expect(
      resolvedItems.map(({ runtimeKey }) =>
        isAccountKeyResourceRuntimeKey(runtimeKey)
          ? runtimeKey.resourceRef.scopeKey
          : null,
      ),
    ).toEqual(["scope-a", "scope-b"])
    expect(resolve).toHaveBeenCalledTimes(2)
    expect(open).toHaveBeenCalledTimes(1)
    expect(mocks.createDisplayAccountApiContext).toHaveBeenCalledTimes(1)
    expect(candidate?.intent.verification).toBe(
      MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS.TRUSTED_NEW,
    )
  })

  it("blocks missing or changed accounts and mismatched result refs before opening a session", async () => {
    const currentAccount = createAccount()
    const missingAccount = createAccount({ id: "missing" })
    const changedSiteAccount = createAccount({
      id: "changed",
      siteType: SITE_TYPES.SUB2API,
    })
    const mismatchedRef = createRef({ accountId: "other-account" })
    const changedOriginProgressAccount = createAccount({
      id: "changed-origin",
      name: "Changed Origin",
    })
    const changedOriginRef = createRef({ accountId: "changed-origin" })
    const changedOriginCurrentAccount = createAccount({
      id: "changed-origin",
      name: "Changed Origin",
      baseUrl: "https://moved.example.invalid",
    })
    const progress = createProgress(
      missingAccount,
      createRef({ accountId: "missing" }),
    )
    progress.results.push(
      createProgress(
        createAccount({ id: "changed", siteType: SITE_TYPES.NEW_API }),
        createRef({ accountId: "changed" }),
      ).results[0],
      createProgress(currentAccount, mismatchedRef).results[0],
      createProgress(changedOriginProgressAccount, changedOriginRef).results[0],
    )

    const candidate = await resolveRepairCreatedKeyBatchImportCandidate({
      progress,
      accounts: [
        currentAccount,
        changedSiteAccount,
        changedOriginCurrentAccount,
      ],
      targetFingerprint: TARGET_A,
      freshness: REPAIR_CREATED_KEY_BATCH_IMPORT_FRESHNESS.CURRENT_SESSION,
    })

    const blockedItems =
      candidate?.items.filter(isBlockedManagedSiteTokenBatchExportItemInput) ??
      []
    expect(blockedItems).toHaveLength(4)
    expect(blockedItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          blockingDetailCode:
            MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_DETAIL_CODES.SOURCE_ACCOUNT_UNAVAILABLE,
        }),
      ]),
    )
    expect(blockedItems).toContainEqual(
      expect.objectContaining({
        id: buildAccountKeyResourceRuntimeKeyId(changedOriginRef),
        blockingDetailCode:
          MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_DETAIL_CODES.SOURCE_ACCOUNT_UNAVAILABLE,
      }),
    )
    expect(mocks.createDisplayAccountApiContext).not.toHaveBeenCalled()
  })

  it("uses full-ref same-target receipts to suppress successes and recheck failed work", async () => {
    const account = createAccount()
    const ref = createRef()
    const progress = createProgress(account, ref)
    const resolve = vi.fn().mockResolvedValue({
      kind: ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS.Resolved,
      secret: "resolved-runtime-secret",
    })
    mocks.createDisplayAccountApiContext.mockReturnValue({
      request: { baseUrl: account.baseUrl },
      capabilities: {
        account: {
          keyResources: {
            open: vi.fn().mockResolvedValue(createSession(resolve)),
          },
        },
      },
    })
    progress.managedSiteImportReceipts = [
      {
        targetFingerprint: TARGET_A,
        resourceRef: ref,
        status: ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES.Created,
        updatedAt: 1,
      },
    ]

    await expect(
      resolveRepairCreatedKeyBatchImportCandidate({
        progress,
        accounts: [account],
        targetFingerprint: TARGET_A,
        freshness: REPAIR_CREATED_KEY_BATCH_IMPORT_FRESHNESS.CURRENT_SESSION,
      }),
    ).resolves.toBeNull()
    expect(
      getRepairCreatedKeyBatchImportAbsenceReason({
        progress,
        targetFingerprint: TARGET_A,
      }),
    ).toBe(REPAIR_CREATED_KEY_BATCH_IMPORT_ABSENCE_REASONS.NOTHING_PENDING)

    progress.managedSiteImportReceipts = [
      {
        targetFingerprint: TARGET_A,
        resourceRef: ref,
        status: ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES.Failed,
        updatedAt: 2,
      },
    ]
    const retryCandidate = await resolveRepairCreatedKeyBatchImportCandidate({
      progress,
      accounts: [account],
      targetFingerprint: TARGET_A,
      freshness: REPAIR_CREATED_KEY_BATCH_IMPORT_FRESHNESS.CURRENT_SESSION,
    })
    expect(retryCandidate?.intent.verification).toBe(
      MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS.COMPLETE,
    )

    const otherTargetCandidate =
      await resolveRepairCreatedKeyBatchImportCandidate({
        progress,
        accounts: [account],
        targetFingerprint: "b".repeat(64),
        freshness: REPAIR_CREATED_KEY_BATCH_IMPORT_FRESHNESS.CURRENT_SESSION,
      })
    expect(otherTargetCandidate?.intent.verification).toBe(
      MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS.TRUSTED_NEW,
    )
  })

  it("rejects non-completed progress and progress without exact created outcomes", () => {
    const account = createAccount()
    const ref = createRef()
    const running = createProgress(account, ref)
    running.state = ACCOUNT_KEY_REPAIR_JOB_STATES.Running
    expect(
      getRepairCreatedKeyBatchImportAbsenceReason({
        progress: running,
        targetFingerprint: TARGET_A,
      }),
    ).toBe(REPAIR_CREATED_KEY_BATCH_IMPORT_ABSENCE_REASONS.NOT_READY)

    const withoutCreated = createProgress(account, ref)
    withoutCreated.results[0].requirementResults = [
      {
        requirement: {
          requirementKey: "uncertain-covered",
          displayName: "Uncertain covered",
          provisioning: {
            kind: ACCOUNT_KEY_REQUIREMENT_PROVISIONING_KINDS.Automatic,
          },
        },
        outcome: ACCOUNT_KEY_RECONCILIATION_OUTCOMES.CoveredAfterUncertain,
        failure: {
          code: RESOURCE_FAILURE_CODES.MutationStateUncertain,
        },
      },
    ]
    withoutCreated.results[0].createdRefs = []
    expect(
      getRepairCreatedKeyBatchImportAbsenceReason({
        progress: withoutCreated,
        targetFingerprint: TARGET_A,
      }),
    ).toBe(
      REPAIR_CREATED_KEY_BATCH_IMPORT_ABSENCE_REASONS.REFERENCES_UNAVAILABLE,
    )
  })
})
