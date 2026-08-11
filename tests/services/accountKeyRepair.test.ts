import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeMessageTypes } from "~/constants/runtimeActions"
import { SITE_TYPES } from "~/constants/siteType"
import {
  ACCOUNT_KEY_RECONCILIATION_INVENTORY_STATUSES,
  ACCOUNT_KEY_RECONCILIATION_OUTCOMES,
} from "~/services/accounts/accountKeyInventoryReconciliation"
import { createAccountKeyResourceCreatedRuntimeSecret } from "~/services/accounts/createdRuntimeSecret"
import {
  ACCOUNT_KEY_PROVISIONING_COVERAGE,
  ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS,
  ACCOUNT_KEY_REQUIREMENT_PROVISIONING_KINDS,
  AccountKeyResourceError,
  type AccountKeyProvisioningSession,
  type AccountKeyResourceRef,
  type AccountKeyResourceSession,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { RESOURCE_FAILURE_CODES } from "~/services/apiAdapters/contracts/resourceNative"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { AuthTypeEnum, type SiteAccount } from "~/types"
import {
  ACCOUNT_KEY_REPAIR_JOB_STATES,
  ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES,
  ACCOUNT_KEY_REPAIR_OUTCOMES,
  ACCOUNT_KEY_REPAIR_PROGRESS_SCHEMA_VERSION,
  ACCOUNT_KEY_REPAIR_SKIP_REASONS,
  type AccountKeyRepairProgress,
} from "~/types/accountKeyAutoProvisioning"
import {
  buildDisplaySiteData,
  buildSiteAccount,
} from "~~/tests/test-utils/factories"

const mocks = vi.hoisted(() => {
  const storageMap = new Map<string, unknown>()
  const pendingStorageSets: Array<() => void> = []
  const sessionsByAccountId = new Map<string, unknown>()
  let shouldBlockNextStorageSet = false
  let shouldRejectNextStorageSet = false

  class StorageMock {
    async get(key: string) {
      return storageMap.get(key)
    }

    async set(key: string, value: unknown) {
      if (shouldBlockNextStorageSet) {
        shouldBlockNextStorageSet = false
        await new Promise<void>((resolve) => {
          pendingStorageSets.push(resolve)
        })
      }
      if (shouldRejectNextStorageSet) {
        shouldRejectNextStorageSet = false
        throw new Error("storage write failed")
      }
      storageMap.set(key, value)
    }
  }

  return {
    storageMap,
    pendingStorageSets,
    sessionsByAccountId,
    StorageMock,
    getAllAccounts: vi.fn(),
    convertToDisplayData: vi.fn(),
    openKeyResources: vi.fn(),
    sendRuntimeMessage: vi.fn(),
    resetRepairCreatedRuntimeSecrets: vi.fn(async () => true),
    captureRepairCreatedRuntimeSecrets: vi.fn(async () => true),
    discardRepairCreatedRuntimeSecrets: vi.fn(async () => true),
    safeRandomUUID: vi.fn(() => "job-123"),
    blockNextStorageSet: () => {
      shouldBlockNextStorageSet = true
    },
    rejectNextStorageSet: () => {
      shouldRejectNextStorageSet = true
    },
    resolveNextStorageSet: () => {
      pendingStorageSets.shift()?.()
    },
  }
})

vi.mock("@plasmohq/storage", () => ({
  Storage: mocks.StorageMock,
}))

vi.mock("~/services/accounts/accountStorage", () => ({
  accountStorage: {
    getAllAccounts: mocks.getAllAccounts,
    convertToDisplayData: mocks.convertToDisplayData,
  },
}))

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteTypeCapabilities: vi.fn((siteType: string) => ({
    siteType,
    account:
      siteType === "unknown"
        ? undefined
        : {
            keyResources: {
              open: mocks.openKeyResources,
            },
          },
  })),
}))

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
  return {
    ...actual,
    sendRuntimeMessage: mocks.sendRuntimeMessage,
  }
})

vi.mock("~/utils/core/identifier", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/core/identifier")>()
  return {
    ...actual,
    safeRandomUUID: mocks.safeRandomUUID,
  }
})

vi.mock(
  "~/services/accounts/accountKeyAutoProvisioning/repairCreatedRuntimeSecrets",
  () => ({
    resetRepairCreatedRuntimeSecrets: mocks.resetRepairCreatedRuntimeSecrets,
    captureRepairCreatedRuntimeSecrets:
      mocks.captureRepairCreatedRuntimeSecrets,
    discardRepairCreatedRuntimeSecrets:
      mocks.discardRepairCreatedRuntimeSecrets,
  }),
)

const REPAIR_PROGRESS_STORAGE_KEY = "accountKeyRepair_progress"

const createEmptySummary = (): AccountKeyRepairProgress["summary"] => ({
  complete: 0,
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
  invalidResources: 0,
  renameApplied: 0,
  renameRejected: 0,
  renameUncertain: 0,
  deleteApplied: 0,
  deleteRejected: 0,
  deleteUncertain: 0,
})

const createProgress = (
  overrides: Partial<AccountKeyRepairProgress> = {},
): AccountKeyRepairProgress => ({
  schemaVersion: ACCOUNT_KEY_REPAIR_PROGRESS_SCHEMA_VERSION,
  jobId: "stored-job",
  state: ACCOUNT_KEY_REPAIR_JOB_STATES.Completed,
  totals: {
    enabledAccounts: 0,
    eligibleAccounts: 0,
    processedAccounts: 0,
  },
  summary: createEmptySummary(),
  results: [],
  ...overrides,
})

const buildRepairAccount = (
  id: string,
  siteType: SiteAccount["site_type"],
  overrides: Partial<SiteAccount> = {},
): SiteAccount =>
  buildSiteAccount({
    id,
    site_name: `Account ${id}`,
    site_url: `https://${id}.example.invalid`,
    site_type: siteType,
    ...overrides,
  })

const createRef = (
  accountId: string,
  resourceId: string,
  siteType: AccountKeyResourceRef["siteType"] = SITE_TYPES.NEW_API,
): AccountKeyResourceRef => ({
  accountId,
  siteType,
  scopeKey: "default",
  resourceId,
})

const createSession = (
  provisioning?: AccountKeyProvisioningSession,
): AccountKeyResourceSession => ({
  provisioning,
  resolveDefaultScope: vi.fn(),
  listScopes: vi.fn(),
  openCollection: vi.fn(),
  openCreateEditor: vi.fn(),
})

const automaticRequirement = (requirementKey: string, displayName: string) => ({
  requirementKey,
  displayName,
  provisioning: {
    kind: ACCOUNT_KEY_REQUIREMENT_PROVISIONING_KINDS.Automatic,
  } as const,
})

const waitForStoredState = async (state: AccountKeyRepairProgress["state"]) => {
  await vi.waitFor(() => {
    expect(
      (
        mocks.storageMap.get(REPAIR_PROGRESS_STORAGE_KEY) as
          | AccountKeyRepairProgress
          | undefined
      )?.state,
    ).toBe(state)
  })
  return mocks.storageMap.get(
    REPAIR_PROGRESS_STORAGE_KEY,
  ) as AccountKeyRepairProgress
}

describe("accountKeyRepair", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.storageMap.clear()
    mocks.pendingStorageSets.splice(0)
    mocks.sessionsByAccountId.clear()
    mocks.safeRandomUUID.mockReturnValue("job-123")
    mocks.getAllAccounts.mockResolvedValue([])
    mocks.convertToDisplayData.mockImplementation((accounts: SiteAccount[]) =>
      accounts.map((account) =>
        buildDisplaySiteData({
          id: account.id,
          name: account.site_name,
          siteType: account.site_type,
          baseUrl: account.site_url,
          authType: account.authType,
          userId: account.account_info?.id ?? "",
          token: account.account_info?.access_token ?? "",
        }),
      ),
    )
    mocks.openKeyResources.mockImplementation(
      async ({ account }: { account: { id: string } }) => {
        const session = mocks.sessionsByAccountId.get(account.id)
        if (session instanceof Error) throw session
        if (!session) throw new Error(`Missing fake session for ${account.id}`)
        return session
      },
    )
  })

  it("returns the required current-schema idle progress", async () => {
    const { accountKeyRepairRunner } = await import(
      "~/services/accounts/accountKeyAutoProvisioning/repair"
    )

    await expect(accountKeyRepairRunner.getProgress()).resolves.toEqual({
      schemaVersion: ACCOUNT_KEY_REPAIR_PROGRESS_SCHEMA_VERSION,
      jobId: "idle",
      state: ACCOUNT_KEY_REPAIR_JOB_STATES.Idle,
      totals: {
        enabledAccounts: 0,
        eligibleAccounts: 0,
        processedAccounts: 0,
      },
      summary: createEmptySummary(),
      results: [],
    })
  })

  it("reads missing or stale schema progress as idle without touching accounts", async () => {
    const savedAccount = buildRepairAccount("saved", SITE_TYPES.NEW_API)
    const legacyProgress = {
      jobId: "legacy-job",
      state: "completed",
      summary: { created: 1, alreadyHad: 0, skipped: 0, failed: 0 },
      totals: { enabledAccounts: 1, eligibleAccounts: 1, processedAccounts: 1 },
      results: [],
    }
    mocks.storageMap.set(REPAIR_PROGRESS_STORAGE_KEY, legacyProgress)
    mocks.getAllAccounts.mockResolvedValue([savedAccount])

    const { accountKeyRepairRunner } = await import(
      "~/services/accounts/accountKeyAutoProvisioning/repair"
    )

    await expect(accountKeyRepairRunner.getProgress()).resolves.toMatchObject({
      schemaVersion: ACCOUNT_KEY_REPAIR_PROGRESS_SCHEMA_VERSION,
      jobId: "idle",
      state: ACCOUNT_KEY_REPAIR_JOB_STATES.Idle,
    })
    expect(mocks.storageMap.get(REPAIR_PROGRESS_STORAGE_KEY)).toBe(
      legacyProgress,
    )
    expect(mocks.getAllAccounts).not.toHaveBeenCalled()
    expect(savedAccount).toEqual(
      buildRepairAccount("saved", SITE_TYPES.NEW_API),
    )
  })

  it("returns a stored current-schema snapshot", async () => {
    const stored = createProgress({ jobId: "current-job", updatedAt: 100 })
    mocks.storageMap.set(REPAIR_PROGRESS_STORAGE_KEY, stored)
    const { accountKeyRepairRunner } = await import(
      "~/services/accounts/accountKeyAutoProvisioning/repair"
    )

    await expect(accountKeyRepairRunner.getProgress()).resolves.toBe(stored)
  })

  it("merges managed-import receipts by exact resource ref without accepting extra fields", async () => {
    const stored = createProgress({ jobId: "receipt-job" })
    const firstRef = createRef("account-1", "resource-1")
    const secondRef = createRef("account-1", "resource-2")
    const targetFingerprint = "a".repeat(64)
    mocks.storageMap.set(REPAIR_PROGRESS_STORAGE_KEY, stored)
    const { accountKeyRepairRunner, recordManagedSiteImportResults } =
      await import("~/services/accounts/accountKeyAutoProvisioning/repair")

    await recordManagedSiteImportResults({
      jobId: stored.jobId,
      targetFingerprint,
      items: [
        {
          resourceRef: firstRef,
          status: ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES.Failed,
        },
        {
          resourceRef: secondRef,
          status: ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES.Created,
        },
      ],
    })
    await recordManagedSiteImportResults({
      jobId: stored.jobId,
      targetFingerprint,
      items: [
        {
          resourceRef: firstRef,
          status:
            ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES.AlreadyPresent,
        },
      ],
    })

    const progress = await accountKeyRepairRunner.getProgress()
    expect(progress.managedSiteImportReceipts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetFingerprint,
          resourceRef: firstRef,
          status:
            ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES.AlreadyPresent,
        }),
        expect.objectContaining({
          targetFingerprint,
          resourceRef: secondRef,
          status: ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES.Created,
        }),
      ]),
    )
    expect(progress.managedSiteImportReceipts).toHaveLength(2)

    const progressBeforeMalformedRequest = progress
    await expect(
      recordManagedSiteImportResults({
        jobId: stored.jobId,
        targetFingerprint,
        items: [
          {
            resourceRef: {
              ...firstRef,
              createdSecret: "must-not-enter-progress",
            },
            status: ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES.Created,
          },
        ],
      }),
    ).rejects.toThrow("invalid_managed_site_import_results_request")
    await expect(accountKeyRepairRunner.getProgress()).resolves.toBe(
      progressBeforeMalformedRequest,
    )
  })

  it("opens native key resources from the stored request and persists secret-free created refs", async () => {
    const account = buildRepairAccount("complete", SITE_TYPES.NEW_API)
    const createdRef = createRef(account.id, "created-resource")
    const existingRef = createRef(account.id, "existing-resource")
    const orphanedRef = createRef(account.id, "orphaned-resource")
    const inspect = vi.fn().mockResolvedValue({
      requirements: [
        automaticRequirement("basic", "Basic"),
        automaticRequirement("premium", "Premium"),
      ],
      items: [
        {
          ref: existingRef,
          placement: {
            kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Requirement,
            requirementKeys: ["basic"],
          },
          coverage: ACCOUNT_KEY_PROVISIONING_COVERAGE.Usable,
          renameSuggestion: { targetDisplayName: "Basic key" },
        },
        {
          ref: orphanedRef,
          displayName: "Retired key",
          placement: {
            kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Orphaned,
            placementKey: "retired",
            displayName: "Retired",
          },
          coverage: ACCOUNT_KEY_PROVISIONING_COVERAGE.Usable,
        },
      ],
    })
    const rename = vi.fn().mockResolvedValue({
      certainty: "applied",
      value: undefined,
    })
    const provision = vi.fn().mockResolvedValue({
      certainty: "applied",
      value: {
        ref: createdRef,
        createdSecret: createAccountKeyResourceCreatedRuntimeSecret({
          ref: createdRef,
          displayName: "Premium",
          secret: "transient-created-secret",
          credential: {
            accountName: account.site_name,
            apiType: API_TYPES.OPENAI_COMPATIBLE,
            baseUrl: account.site_url,
            siteType: account.site_type,
            tagIds: [],
          },
        }),
      },
    })
    mocks.sessionsByAccountId.set(
      account.id,
      createSession({ inspect, provision, rename }),
    )
    mocks.getAllAccounts.mockResolvedValue([account])

    const { startAccountKeyRepair } = await import(
      "~/services/accounts/accountKeyAutoProvisioning/repair"
    )
    await startAccountKeyRepair({ renameAutoTemplateTokens: true })
    const progress = await waitForStoredState(
      ACCOUNT_KEY_REPAIR_JOB_STATES.Completed,
    )

    expect(mocks.openKeyResources).toHaveBeenCalledWith(
      {
        account: {
          id: account.id,
          name: account.site_name,
          siteType: account.site_type,
        },
        request: expect.objectContaining({
          accountId: account.id,
          baseUrl: account.site_url,
          auth: expect.objectContaining({
            authType: account.authType,
            userId: account.account_info?.id,
            accessToken: account.account_info?.access_token,
          }),
        }),
      },
      { signal: expect.any(AbortSignal) },
    )
    expect(provision).toHaveBeenCalledWith("premium", {
      signal: expect.any(AbortSignal),
    })
    expect(rename).toHaveBeenCalledWith(existingRef, {
      signal: expect.any(AbortSignal),
    })
    expect(progress.results).toEqual([
      expect.objectContaining({
        accountId: account.id,
        outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Repaired,
        inventoryStatus: ACCOUNT_KEY_RECONCILIATION_INVENTORY_STATUSES.Complete,
        createdRefs: [createdRef],
        invalidResources: [
          expect.objectContaining({
            ref: orphanedRef,
            displayLabel: "Retired key",
            groupLabel: "Retired",
            reason: "orphaned-placement",
          }),
        ],
        renameResults: [{ ref: existingRef, outcome: "applied" }],
        requirementResults: [
          expect.objectContaining({
            outcome: ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Covered,
          }),
          {
            requirement: {
              requirementKey: "premium",
              displayName: "Premium",
              provisioning: {
                kind: ACCOUNT_KEY_REQUIREMENT_PROVISIONING_KINDS.Automatic,
              },
            },
            outcome: ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Created,
            created: { ref: createdRef },
          },
        ],
      }),
    ])
    expect(progress.summary).toMatchObject({
      complete: 1,
      requirements: 2,
      coveredRequirements: 1,
      createdRequirements: 1,
      invalidResources: 1,
      renameApplied: 1,
    })
    expect(JSON.stringify(progress)).not.toContain("transient-created-secret")
    expect(mocks.resetRepairCreatedRuntimeSecrets).toHaveBeenCalledWith(
      "job-123",
    )
    expect(mocks.captureRepairCreatedRuntimeSecrets).toHaveBeenCalledWith(
      "job-123",
      [{ ref: createdRef, secret: "transient-created-secret" }],
    )
    expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: RuntimeMessageTypes.AccountKeyRepairProgress,
      }),
      { maxAttempts: 1 },
    )
  })

  it("classifies accounts with no missing keys as covered", async () => {
    const account = buildRepairAccount("covered", SITE_TYPES.NEW_API)
    const existingRef = createRef(account.id, "existing-resource")
    mocks.sessionsByAccountId.set(
      account.id,
      createSession({
        inspect: vi.fn().mockResolvedValue({
          requirements: [automaticRequirement("basic", "Basic")],
          items: [
            {
              ref: existingRef,
              placement: {
                kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Requirement,
                requirementKeys: ["basic"],
              },
              coverage: ACCOUNT_KEY_PROVISIONING_COVERAGE.Usable,
            },
          ],
        }),
        provision: vi.fn(),
      }),
    )
    mocks.getAllAccounts.mockResolvedValue([account])

    const { startAccountKeyRepair } = await import(
      "~/services/accounts/accountKeyAutoProvisioning/repair"
    )
    await startAccountKeyRepair()
    const progress = await waitForStoredState(
      ACCOUNT_KEY_REPAIR_JOB_STATES.Completed,
    )

    expect(progress.results[0]).toMatchObject({
      accountId: account.id,
      outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Covered,
    })
    expect(progress.summary).toMatchObject({ complete: 1 })
  })

  it("classifies blocked-only, mixed controlled outcomes, and unexpected throws", async () => {
    const blocked = buildRepairAccount("blocked", SITE_TYPES.SUB2API)
    const partial = buildRepairAccount("partial", SITE_TYPES.VELOERA)
    const failed = buildRepairAccount("failed", SITE_TYPES.ONE_API)

    mocks.sessionsByAccountId.set(
      blocked.id,
      createSession({
        inspect: vi.fn().mockResolvedValue({
          requirements: [
            {
              requirementKey: "1",
              displayName: "Tier 1",
              provisioning: {
                kind: ACCOUNT_KEY_REQUIREMENT_PROVISIONING_KINDS.InputRequired,
                reasonCode: "finite-quota-required",
              },
            },
          ],
          items: [],
        }),
        provision: vi.fn(),
      }),
    )
    const partialInspect = vi.fn().mockResolvedValue({
      requirements: [
        automaticRequirement("covered", "Covered"),
        automaticRequirement("rejected", "Rejected"),
        automaticRequirement("uncertain", "Uncertain"),
      ],
      items: [
        {
          ref: createRef(partial.id, "covered", partial.site_type),
          placement: {
            kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Requirement,
            requirementKeys: ["covered"],
          },
          coverage: ACCOUNT_KEY_PROVISIONING_COVERAGE.Usable,
        },
      ],
    })
    mocks.sessionsByAccountId.set(
      partial.id,
      createSession({
        inspect: partialInspect,
        provision: vi.fn(async (requirementKey: string) =>
          requirementKey === "rejected"
            ? {
                certainty: "not-applied" as const,
                failure: { code: RESOURCE_FAILURE_CODES.UpstreamRejected },
              }
            : {
                certainty: "possibly-applied" as const,
                failure: {
                  code: RESOURCE_FAILURE_CODES.MutationStateUncertain,
                  message: "Create result could not be confirmed",
                },
              },
        ),
      }),
    )
    mocks.sessionsByAccountId.set(failed.id, new Error("adapter exploded"))
    mocks.getAllAccounts.mockResolvedValue([blocked, partial, failed])

    const { startAccountKeyRepair } = await import(
      "~/services/accounts/accountKeyAutoProvisioning/repair"
    )
    await startAccountKeyRepair()
    const progress = await waitForStoredState(
      ACCOUNT_KEY_REPAIR_JOB_STATES.Completed,
    )

    expect(progress.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountId: blocked.id,
          outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Blocked,
          requirementResults: [
            expect.objectContaining({
              outcome: ACCOUNT_KEY_RECONCILIATION_OUTCOMES.BlockedInputRequired,
            }),
          ],
        }),
        expect.objectContaining({
          accountId: partial.id,
          outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Partial,
          requirementResults: expect.arrayContaining([
            expect.objectContaining({
              outcome: ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Covered,
            }),
            expect.objectContaining({
              outcome: ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Rejected,
            }),
            expect.objectContaining({
              outcome: ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Uncertain,
            }),
          ]),
        }),
        expect.objectContaining({
          accountId: failed.id,
          outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Failed,
          errorMessage: "adapter exploded",
        }),
      ]),
    )
    expect(progress.summary).toMatchObject({
      blocked: 1,
      partial: 1,
      failed: 1,
      requirements: 4,
      coveredRequirements: 1,
      blockedRequirements: 1,
      rejectedRequirements: 1,
      uncertainRequirements: 1,
    })
    expect(progress.totals).toEqual({
      enabledAccounts: 3,
      eligibleAccounts: 3,
      processedAccounts: 3,
    })
  })

  it("preserves structured account-key resource failures in account results", async () => {
    const account = buildRepairAccount("structured-failure", SITE_TYPES.NEW_API)
    const failure = {
      code: RESOURCE_FAILURE_CODES.Unexpected,
      message: "Provider inventory is temporarily unavailable",
      upstreamCode: "INVENTORY_UNAVAILABLE",
    } as const
    mocks.sessionsByAccountId.set(
      account.id,
      new AccountKeyResourceError(failure),
    )
    mocks.getAllAccounts.mockResolvedValue([account])

    const { startAccountKeyRepair } = await import(
      "~/services/accounts/accountKeyAutoProvisioning/repair"
    )
    await startAccountKeyRepair()
    const progress = await waitForStoredState(
      ACCOUNT_KEY_REPAIR_JOB_STATES.Completed,
    )

    expect(progress.results).toEqual([
      expect.objectContaining({
        accountId: account.id,
        outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Failed,
        failure,
      }),
    ])
    expect(progress.results[0]).not.toHaveProperty("errorMessage", "unexpected")
  })

  it("does not classify incomplete inventory as complete when known requirements are covered", async () => {
    const account = buildRepairAccount("incomplete-covered", SITE_TYPES.NEW_API)
    const coveredRef = createRef(account.id, "covered-resource")
    mocks.sessionsByAccountId.set(
      account.id,
      createSession({
        inspect: vi.fn().mockResolvedValue({
          requirements: [automaticRequirement("covered", "Covered")],
          items: [
            {
              ref: coveredRef,
              placement: {
                kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Requirement,
                requirementKeys: ["covered"],
              },
              coverage: ACCOUNT_KEY_PROVISIONING_COVERAGE.Usable,
            },
          ],
          partialFailure: { code: RESOURCE_FAILURE_CODES.Unavailable },
        }),
        provision: vi.fn(),
      }),
    )
    mocks.getAllAccounts.mockResolvedValue([account])

    const { startAccountKeyRepair } = await import(
      "~/services/accounts/accountKeyAutoProvisioning/repair"
    )
    await startAccountKeyRepair()
    const progress = await waitForStoredState(
      ACCOUNT_KEY_REPAIR_JOB_STATES.Completed,
    )

    expect(progress.results[0]).toMatchObject({
      accountId: account.id,
      inventoryStatus: ACCOUNT_KEY_RECONCILIATION_INVENTORY_STATUSES.Incomplete,
      inventoryIssues: [{ code: "partial-failure", count: 1 }],
      outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Partial,
      requirementResults: [
        expect.objectContaining({
          outcome: ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Covered,
        }),
      ],
    })
    expect(progress.summary).toMatchObject({ complete: 0, partial: 1 })
  })

  it("keeps none-auth, AIHubMix, missing key resources, and missing provisioning as controlled skips", async () => {
    const noneAuth = buildRepairAccount("none", SITE_TYPES.NEW_API, {
      authType: AuthTypeEnum.None,
    })
    const aihubmix = buildRepairAccount("aihubmix", SITE_TYPES.AIHUBMIX)
    const unsupported = buildRepairAccount("unsupported", SITE_TYPES.UNKNOWN)
    const missingProvisioning = buildRepairAccount(
      "missing-provisioning",
      SITE_TYPES.OPENROUTER,
    )
    mocks.sessionsByAccountId.set(
      missingProvisioning.id,
      createSession(undefined),
    )
    mocks.getAllAccounts.mockResolvedValue([
      noneAuth,
      aihubmix,
      unsupported,
      missingProvisioning,
    ])

    const { startAccountKeyRepair } = await import(
      "~/services/accounts/accountKeyAutoProvisioning/repair"
    )
    await startAccountKeyRepair()
    const progress = await waitForStoredState(
      ACCOUNT_KEY_REPAIR_JOB_STATES.Completed,
    )

    expect(progress.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountId: noneAuth.id,
          outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Skipped,
          skipReason: ACCOUNT_KEY_REPAIR_SKIP_REASONS.NoneAuth,
        }),
        expect.objectContaining({
          accountId: aihubmix.id,
          skipReason: ACCOUNT_KEY_REPAIR_SKIP_REASONS.AihubmixOneTimeKey,
        }),
        expect.objectContaining({
          accountId: unsupported.id,
          skipReason: ACCOUNT_KEY_REPAIR_SKIP_REASONS.ProvisioningUnavailable,
        }),
        expect.objectContaining({
          accountId: missingProvisioning.id,
          skipReason: ACCOUNT_KEY_REPAIR_SKIP_REASONS.ProvisioningUnavailable,
        }),
      ]),
    )
    expect(progress.summary.skipped).toBe(4)
    expect(progress.totals).toEqual({
      enabledAccounts: 4,
      eligibleAccounts: 1,
      processedAccounts: 0,
    })
  })

  it("preserves per-origin serialization while allowing different origins to proceed", async () => {
    let releaseFirst!: () => void
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const first = buildRepairAccount("first", SITE_TYPES.NEW_API, {
      site_url: "https://same.example.invalid",
    })
    const second = buildRepairAccount("second", SITE_TYPES.NEW_API, {
      site_url: "https://same.example.invalid/path",
    })
    const other = buildRepairAccount("other", SITE_TYPES.NEW_API, {
      site_url: "https://other.example.invalid",
    })
    const started: string[] = []

    for (const account of [first, second, other]) {
      mocks.sessionsByAccountId.set(
        account.id,
        createSession({
          inspect: vi.fn(async () => {
            started.push(account.id)
            if (account.id === first.id) await firstGate
            return { requirements: [], items: [] }
          }),
          provision: vi.fn(),
        }),
      )
    }
    mocks.getAllAccounts.mockResolvedValue([first, second, other])

    const { startAccountKeyRepair } = await import(
      "~/services/accounts/accountKeyAutoProvisioning/repair"
    )
    await startAccountKeyRepair()
    await vi.waitFor(() => {
      expect(started).toEqual(expect.arrayContaining([first.id, other.id]))
    })
    expect(started).not.toContain(second.id)

    releaseFirst()
    await waitForStoredState(ACCOUNT_KEY_REPAIR_JOB_STATES.Completed)
    expect(started.indexOf(second.id)).toBeGreaterThan(
      started.indexOf(first.id),
    )
  })

  it("cancels an in-flight reconciliation without recording a late result", async () => {
    let releaseInspect!: () => void
    const inspectGate = new Promise<void>((resolve) => {
      releaseInspect = resolve
    })
    const account = buildRepairAccount("cancelled", SITE_TYPES.NEW_API)
    mocks.sessionsByAccountId.set(
      account.id,
      createSession({
        inspect: vi.fn(async () => {
          await inspectGate
          return { requirements: [], items: [] }
        }),
        provision: vi.fn(),
      }),
    )
    mocks.getAllAccounts.mockResolvedValue([account])

    const { accountKeyRepairRunner } = await import(
      "~/services/accounts/accountKeyAutoProvisioning/repair"
    )
    await accountKeyRepairRunner.start()
    await vi.waitFor(() => expect(mocks.openKeyResources).toHaveBeenCalled())
    await expect(accountKeyRepairRunner.cancel()).resolves.toMatchObject({
      success: true,
      data: { state: ACCOUNT_KEY_REPAIR_JOB_STATES.Cancelled },
    })
    releaseInspect()
    await vi.waitFor(async () => {
      const progress = await accountKeyRepairRunner.getProgress()
      expect(progress.state).toBe(ACCOUNT_KEY_REPAIR_JOB_STATES.Cancelled)
      expect(progress.results).toEqual([])
    })
  })

  it("rolls back failed persistence and recovers the serialized storage queue", async () => {
    mocks.rejectNextStorageSet()
    const { accountKeyRepairRunner } = await import(
      "~/services/accounts/accountKeyAutoProvisioning/repair"
    )

    await expect(accountKeyRepairRunner.start()).rejects.toThrow(
      "storage write failed",
    )
    await expect(accountKeyRepairRunner.getProgress()).resolves.toMatchObject({
      jobId: "idle",
      state: ACCOUNT_KEY_REPAIR_JOB_STATES.Idle,
    })

    await vi.waitFor(async () => {
      const progress = await accountKeyRepairRunner.start()
      expect(progress.jobId).toBe("job-123")
    })
    await waitForStoredState(ACCOUNT_KEY_REPAIR_JOB_STATES.Completed)
  })

  it("terminalizes a current-schema running snapshot after a cold start", async () => {
    mocks.storageMap.set(
      REPAIR_PROGRESS_STORAGE_KEY,
      createProgress({
        jobId: "stale-running",
        state: ACCOUNT_KEY_REPAIR_JOB_STATES.Running,
      }),
    )
    const { accountKeyRepairRunner } = await import(
      "~/services/accounts/accountKeyAutoProvisioning/repair"
    )

    await expect(accountKeyRepairRunner.getProgress()).resolves.toMatchObject({
      jobId: "stale-running",
      state: ACCOUNT_KEY_REPAIR_JOB_STATES.Cancelled,
      finishedAt: expect.any(Number),
    })
    expect(mocks.resetRepairCreatedRuntimeSecrets).toHaveBeenCalledWith(
      "stale-running",
    )
  })

  it("deletes exact invalid refs serially and keeps rejected or uncertain rows visible", async () => {
    const account = buildRepairAccount("account-1", SITE_TYPES.NEW_API, {
      site_url: "https://account.example.invalid/path",
    })
    const resources = ["applied", "rejected", "uncertain"].map(
      (resourceId) => ({
        accountId: "account-1",
        accountName: "Example Account",
        siteType: SITE_TYPES.NEW_API,
        siteUrlOrigin: "https://account.example.invalid",
        ref: createRef("account-1", resourceId),
        displayLabel: `Key ${resourceId}`,
        groupLabel: "Retired",
        reason: "orphaned-placement",
      }),
    )
    const deleteResource = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(
        new AccountKeyResourceError({
          code: RESOURCE_FAILURE_CODES.UpstreamRejected,
        }),
      )
      .mockRejectedValueOnce(
        new AccountKeyResourceError({
          code: RESOURCE_FAILURE_CODES.MutationStateUncertain,
        }),
      )
    const openCollection = vi.fn(async () => ({ delete: deleteResource }))
    mocks.sessionsByAccountId.set(account.id, {
      ...createSession(),
      openCollection,
    })
    mocks.getAllAccounts.mockResolvedValue([account])
    mocks.storageMap.set(
      REPAIR_PROGRESS_STORAGE_KEY,
      createProgress({
        results: [
          {
            accountId: account.id,
            accountName: "Example Account",
            siteType: account.site_type,
            siteUrlOrigin: "https://account.example.invalid",
            outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Covered,
            requirementResults: [],
            createdRefs: [],
            invalidResources: resources,
            renameResults: [],
            finishedAt: 1,
          },
        ],
        summary: { ...createEmptySummary(), invalidResources: 3 },
      }),
    )
    const { deleteInvalidAccountKeyResources } = await import(
      "~/services/accounts/accountKeyAutoProvisioning/repair"
    )

    const response = await deleteInvalidAccountKeyResources({ resources })

    expect(response.data.results.map(({ outcome }) => outcome)).toEqual([
      "applied",
      "rejected",
      "uncertain",
    ])
    expect(deleteResource.mock.invocationCallOrder).toEqual(
      [...deleteResource.mock.invocationCallOrder].sort(
        (left, right) => left - right,
      ),
    )
    expect(deleteResource).toHaveBeenNthCalledWith(1, resources[0].ref)
    expect(deleteResource).toHaveBeenNthCalledWith(2, resources[1].ref)
    expect(deleteResource).toHaveBeenNthCalledWith(3, resources[2].ref)
    expect(openCollection).toHaveBeenCalledTimes(3)
    expect(mocks.openKeyResources).toHaveBeenCalledOnce()

    const progress = mocks.storageMap.get(
      REPAIR_PROGRESS_STORAGE_KEY,
    ) as AccountKeyRepairProgress
    expect(progress.results[0].invalidResources).toEqual(resources.slice(1))
    expect(progress.summary).toMatchObject({
      invalidResources: 2,
      deleteApplied: 1,
      deleteRejected: 1,
      deleteUncertain: 1,
    })
  })

  it("rejects duplicate invalid refs before any destructive mutation", async () => {
    const resource = {
      accountId: "account-1",
      accountName: "Example Account",
      siteType: SITE_TYPES.NEW_API,
      siteUrlOrigin: "https://account.example.invalid",
      ref: createRef("account-1", "duplicate-resource"),
      reason: "orphaned-placement",
    }
    const { deleteInvalidAccountKeyResources } = await import(
      "~/services/accounts/accountKeyAutoProvisioning/repair"
    )

    await expect(
      deleteInvalidAccountKeyResources({ resources: [resource, resource] }),
    ).rejects.toThrow("invalid_resource_delete_request")
    expect(mocks.getAllAccounts).not.toHaveBeenCalled()
    expect(mocks.openKeyResources).not.toHaveBeenCalled()
  })

  it("marks the job failed when account loading throws", async () => {
    mocks.getAllAccounts.mockRejectedValue(new Error("storage unavailable"))
    const { startAccountKeyRepair } = await import(
      "~/services/accounts/accountKeyAutoProvisioning/repair"
    )

    await startAccountKeyRepair()
    await expect(
      waitForStoredState(ACCOUNT_KEY_REPAIR_JOB_STATES.Failed),
    ).resolves.toMatchObject({
      lastError: "storage unavailable",
    })
  })
})
