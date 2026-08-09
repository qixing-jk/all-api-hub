import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  buildAccountTokenRuntimeKeyId,
  isAccountTokenRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
import {
  getRepairCreatedTokenBatchImportAbsenceReason,
  REPAIR_CREATED_TOKEN_BATCH_IMPORT_ABSENCE_REASONS,
  REPAIR_CREATED_TOKEN_BATCH_IMPORT_FRESHNESS,
  resolveRepairCreatedTokenBatchImportCandidate,
} from "~/services/managedSites/repairCreatedTokenBatchImport"
import type { ApiToken, DisplaySiteData } from "~/types"
import {
  ACCOUNT_KEY_REPAIR_JOB_STATES,
  ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES,
  ACCOUNT_KEY_REPAIR_OUTCOMES,
  type AccountKeyRepairAccountResult,
  type AccountKeyRepairProgress,
} from "~/types/accountKeyAutoProvisioning"
import {
  isBlockedManagedSiteTokenBatchExportItemInput,
  isResolvedManagedSiteTokenBatchExportItemInput,
  MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_DETAIL_CODES,
  MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES,
  MANAGED_SITE_TOKEN_BATCH_EXPORT_INPUT_KINDS,
  MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS,
} from "~/types/managedSiteTokenBatchExport"
import {
  createAccount,
  createToken,
} from "~~/tests/utils/keyManagementFactories"

const mocks = vi.hoisted(() => ({
  createDisplayAccountApiContext: vi.fn(),
}))

vi.mock("~/services/accounts/utils/apiServiceRequest", () => ({
  createDisplayAccountApiContext: mocks.createDisplayAccountApiContext,
}))

const TARGET_A = "a".repeat(64)
const TARGET_B = "b".repeat(64)

function buildAccount(
  id: string,
  overrides: Partial<DisplaySiteData> = {},
): DisplaySiteData {
  return createAccount({
    id,
    name: `Account ${id}`,
    baseUrl: `https://${id}.example.invalid`,
    ...overrides,
  }) as DisplaySiteData
}

function buildRepairResult(
  accountId: string,
  overrides: Partial<AccountKeyRepairAccountResult> = {},
): AccountKeyRepairAccountResult {
  return {
    accountId,
    accountName: `Account ${accountId}`,
    siteType: buildAccount(accountId).siteType,
    siteUrlOrigin: `https://${accountId}.example.invalid`,
    outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Created,
    createdGroups: [],
    createdTokens: [],
    finishedAt: 1,
    ...overrides,
  }
}

function buildProgress(
  results: AccountKeyRepairAccountResult[],
  overrides: Partial<AccountKeyRepairProgress> = {},
): AccountKeyRepairProgress {
  return {
    jobId: "repair-job",
    state: ACCOUNT_KEY_REPAIR_JOB_STATES.Completed,
    totals: {
      enabledAccounts: results.length,
      eligibleAccounts: results.length,
      processedAccounts: results.length,
    },
    summary: {
      created: results.length,
      alreadyHad: 0,
      skipped: 0,
      failed: 0,
    },
    results,
    ...overrides,
  }
}

function createApiContext(options: {
  tokens?: ApiToken[]
  fetchAllTokens?: ReturnType<typeof vi.fn>
  fetchTokens?: ReturnType<typeof vi.fn>
}) {
  const fetchTokens =
    options.fetchTokens ?? vi.fn().mockResolvedValue(options.tokens ?? [])
  const fetchAllTokens =
    options.fetchAllTokens ?? vi.fn().mockResolvedValue(options.tokens ?? [])

  return {
    fetchAllTokens,
    fetchTokens,
    context: {
      request: { baseUrl: "https://source.example.invalid" },
      keyManagement: {
        fetchAllTokens,
        fetchTokens,
      },
    },
  }
}

describe("resolveRepairCreatedTokenBatchImportCandidate", () => {
  beforeEach(() => {
    mocks.createDisplayAccountApiContext.mockReset()
  })

  it("loads each affected account once and resolves only exact account-token references", async () => {
    const account = buildAccount("account-1")
    const unaffectedAccount = buildAccount("account-2")
    const tokens = [
      createToken({ id: 11, group: "alpha", name: "Alpha key" }),
      createToken({ id: 12, group: " beta ", name: "Beta key" }),
      createToken({ id: 99, group: "alpha", name: "Pre-existing key" }),
    ] as ApiToken[]
    const { context, fetchAllTokens, fetchTokens } = createApiContext({
      tokens,
    })
    mocks.createDisplayAccountApiContext.mockReturnValue(context)

    const candidate = await resolveRepairCreatedTokenBatchImportCandidate({
      progress: buildProgress([
        buildRepairResult(account.id, {
          createdGroups: ["alpha", "beta"],
          createdTokens: [
            { tokenId: 11, group: "alpha" },
            { tokenId: 12, group: "beta" },
          ],
        }),
      ]),
      accounts: [account, unaffectedAccount],
      targetFingerprint: TARGET_A,
      freshness: REPAIR_CREATED_TOKEN_BATCH_IMPORT_FRESHNESS.CURRENT_SESSION,
    })

    expect(candidate?.intent.verification).toBe(
      MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS.TRUSTED_NEW,
    )
    expect(fetchAllTokens).toHaveBeenCalledTimes(1)
    expect(fetchTokens).not.toHaveBeenCalled()
    expect(mocks.createDisplayAccountApiContext).toHaveBeenCalledTimes(1)
    expect(mocks.createDisplayAccountApiContext).toHaveBeenCalledWith(account)

    const resolvedItems =
      candidate?.items.filter(isResolvedManagedSiteTokenBatchExportItemInput) ??
      []
    expect(resolvedItems.map(({ runtimeKey }) => runtimeKey.id)).toEqual([
      buildAccountTokenRuntimeKeyId(account.id, 11),
      buildAccountTokenRuntimeKeyId(account.id, 12),
    ])
    expect(
      resolvedItems.map(({ runtimeKey }) =>
        isAccountTokenRuntimeKey(runtimeKey) ? runtimeKey.tokenId : null,
      ),
    ).toEqual([11, 12])
    expect(
      resolvedItems.some(
        ({ runtimeKey }) => runtimeKey.label === "Pre-existing key",
      ),
    ).toBe(false)
  })

  it("falls back to the paged inventory API when full inventory is unavailable", async () => {
    const account = buildAccount("account-1")
    const fetchTokens = vi
      .fn()
      .mockResolvedValue([createToken({ id: 11, group: "alpha" })])
    mocks.createDisplayAccountApiContext.mockReturnValue({
      request: { baseUrl: account.baseUrl },
      keyManagement: { fetchTokens },
    })

    const candidate = await resolveRepairCreatedTokenBatchImportCandidate({
      progress: buildProgress([
        buildRepairResult(account.id, {
          createdGroups: ["alpha"],
          createdTokens: [{ tokenId: 11, group: "alpha" }],
        }),
      ]),
      accounts: [account],
      targetFingerprint: TARGET_A,
      freshness: REPAIR_CREATED_TOKEN_BATCH_IMPORT_FRESHNESS.CURRENT_SESSION,
    })

    expect(candidate?.items).toHaveLength(1)
    expect(fetchTokens).toHaveBeenCalledTimes(1)
  })

  it("keeps missing accounts, vanished keys, inventory failures, group mismatches, and ambiguous groups visible as blockers", async () => {
    const vanishedAccount = buildAccount("vanished")
    const failingAccount = buildAccount("failing")
    const mismatchedAccount = buildAccount("mismatched")

    mocks.createDisplayAccountApiContext.mockImplementation(
      (account: DisplaySiteData) => {
        if (account.id === failingAccount.id) {
          return createApiContext({
            fetchAllTokens: vi
              .fn()
              .mockRejectedValue(new Error("private upstream error")),
          }).context
        }
        if (account.id === mismatchedAccount.id) {
          return createApiContext({
            tokens: [createToken({ id: 33, group: "other" }) as ApiToken],
          }).context
        }
        return createApiContext({ tokens: [] }).context
      },
    )

    const candidate = await resolveRepairCreatedTokenBatchImportCandidate({
      progress: buildProgress([
        buildRepairResult("missing", {
          createdGroups: ["alpha"],
          createdTokens: [{ tokenId: 11, group: "alpha" }],
        }),
        buildRepairResult(vanishedAccount.id, {
          createdGroups: ["beta"],
          createdTokens: [{ tokenId: 22, group: "beta" }],
        }),
        buildRepairResult(failingAccount.id, {
          createdGroups: ["gamma"],
          createdTokens: [{ tokenId: 23, group: "gamma" }],
        }),
        buildRepairResult(mismatchedAccount.id, {
          createdGroups: ["delta", "ambiguous"],
          createdTokens: [{ tokenId: 33, group: "delta" }],
        }),
      ]),
      accounts: [vanishedAccount, failingAccount, mismatchedAccount],
      targetFingerprint: TARGET_A,
      freshness: REPAIR_CREATED_TOKEN_BATCH_IMPORT_FRESHNESS.CURRENT_SESSION,
    })

    const blockedItems =
      candidate?.items.filter(isBlockedManagedSiteTokenBatchExportItemInput) ??
      []
    expect(blockedItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: buildAccountTokenRuntimeKeyId("missing", 11),
          kind: MANAGED_SITE_TOKEN_BATCH_EXPORT_INPUT_KINDS.BLOCKED_REFERENCE,
        }),
        expect.objectContaining({
          id: buildAccountTokenRuntimeKeyId(vanishedAccount.id, 22),
        }),
        expect.objectContaining({
          id: buildAccountTokenRuntimeKeyId(failingAccount.id, 23),
          blockingDetailCode:
            MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_DETAIL_CODES.SOURCE_KEY_INVENTORY_UNAVAILABLE,
        }),
        expect.objectContaining({
          id: buildAccountTokenRuntimeKeyId(mismatchedAccount.id, 33),
        }),
        expect.objectContaining({
          id: `repair-created:${mismatchedAccount.id}:ambiguous`,
          keyLabel: "ambiguous",
        }),
      ]),
    )
    expect(blockedItems).toHaveLength(5)
    expect(JSON.stringify(blockedItems)).not.toContain("private upstream error")
    expect(
      blockedItems.every(
        ({ blockingReasonCode }) =>
          blockingReasonCode ===
          MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.INPUT_PREPARATION_FAILED,
      ),
    ).toBe(true)
  })

  it("blocks unavailable key management and ambiguous exact inventory matches", async () => {
    const unavailableAccount = buildAccount("unavailable")
    const ambiguousAccount = buildAccount("ambiguous")

    mocks.createDisplayAccountApiContext.mockImplementation(
      (account: DisplaySiteData) => {
        if (account.id === unavailableAccount.id) {
          return {
            request: { baseUrl: account.baseUrl },
            keyManagement: null,
          } as never
        }
        return createApiContext({
          tokens: [
            createToken({ id: 44, group: "duplicate" }) as ApiToken,
            createToken({ id: 44, group: "duplicate" }) as ApiToken,
          ],
        }).context
      },
    )

    const candidate = await resolveRepairCreatedTokenBatchImportCandidate({
      progress: buildProgress([
        buildRepairResult(unavailableAccount.id, {
          createdGroups: ["alpha"],
          createdTokens: [{ tokenId: 11, group: "alpha" }],
        }),
        buildRepairResult(ambiguousAccount.id, {
          createdGroups: ["duplicate"],
          createdTokens: [{ tokenId: 44, group: "duplicate" }],
        }),
      ]),
      accounts: [unavailableAccount, ambiguousAccount],
      targetFingerprint: TARGET_A,
      freshness: REPAIR_CREATED_TOKEN_BATCH_IMPORT_FRESHNESS.CURRENT_SESSION,
    })

    expect(
      candidate?.items.filter(isBlockedManagedSiteTokenBatchExportItemInput),
    ).toEqual([
      expect.objectContaining({
        id: buildAccountTokenRuntimeKeyId(unavailableAccount.id, 11),
        blockingDetailCode:
          MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_DETAIL_CODES.SOURCE_KEY_INVENTORY_UNAVAILABLE,
      }),
      expect.objectContaining({
        id: buildAccountTokenRuntimeKeyId(ambiguousAccount.id, 44),
        blockingDetailCode:
          MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_DETAIL_CODES.CREATED_KEY_REFERENCE_AMBIGUOUS,
      }),
    ])
  })

  it("excludes confirmed same-target receipts while retaining failed and uncertain work with complete verification", async () => {
    const account = buildAccount("account-1")
    const tokens = [11, 12, 13, 14, 15].map(
      (id) => createToken({ id, group: `group-${id}` }) as ApiToken,
    )
    mocks.createDisplayAccountApiContext.mockReturnValue(
      createApiContext({ tokens }).context,
    )

    const candidate = await resolveRepairCreatedTokenBatchImportCandidate({
      progress: buildProgress(
        [
          buildRepairResult(account.id, {
            createdGroups: tokens.map(({ group }) => group ?? ""),
            createdTokens: tokens.map(({ id, group }) => ({
              tokenId: id,
              group: group ?? "",
            })),
          }),
        ],
        {
          managedSiteImportReceipts: [
            {
              targetFingerprint: TARGET_A,
              accountId: account.id,
              tokenId: 11,
              status: ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES.Created,
              updatedAt: 2,
            },
            {
              targetFingerprint: TARGET_A,
              accountId: account.id,
              tokenId: 11,
              status: ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES.Failed,
              updatedAt: 1,
            },
            {
              targetFingerprint: TARGET_A,
              accountId: account.id,
              tokenId: 12,
              status:
                ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES.AlreadyPresent,
              updatedAt: 1,
            },
            {
              targetFingerprint: TARGET_A,
              accountId: account.id,
              tokenId: 13,
              status: ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES.Failed,
              updatedAt: 1,
            },
            {
              targetFingerprint: TARGET_A,
              accountId: account.id,
              tokenId: 14,
              status: ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES.Uncertain,
              updatedAt: 1,
            },
            {
              targetFingerprint: TARGET_B,
              accountId: account.id,
              tokenId: 15,
              status: ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES.Created,
              updatedAt: 1,
            },
          ],
        },
      ),
      accounts: [account],
      targetFingerprint: TARGET_A,
      freshness: REPAIR_CREATED_TOKEN_BATCH_IMPORT_FRESHNESS.CURRENT_SESSION,
    })

    expect(candidate?.intent.verification).toBe(
      MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS.COMPLETE,
    )
    expect(
      candidate?.items
        .filter(isResolvedManagedSiteTokenBatchExportItemInput)
        .map(({ runtimeKey }) => runtimeKey.id),
    ).toEqual([
      buildAccountTokenRuntimeKeyId(account.id, 13),
      buildAccountTokenRuntimeKeyId(account.id, 14),
      buildAccountTokenRuntimeKeyId(account.id, 15),
    ])
  })

  it("classifies exact references settled for the current target as nothing pending", async () => {
    const account = buildAccount("account-1")
    const progress = buildProgress(
      [
        buildRepairResult(account.id, {
          createdGroups: ["alpha", "beta"],
          createdTokens: [
            { tokenId: 11, group: "alpha" },
            { tokenId: 12, group: "beta" },
          ],
        }),
      ],
      {
        managedSiteImportReceipts: [
          {
            targetFingerprint: TARGET_A,
            accountId: account.id,
            tokenId: 11,
            status: ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES.Created,
            updatedAt: 1,
          },
          {
            targetFingerprint: TARGET_A,
            accountId: account.id,
            tokenId: 12,
            status:
              ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES.AlreadyPresent,
            updatedAt: 1,
          },
        ],
      },
    )

    expect(
      getRepairCreatedTokenBatchImportAbsenceReason({
        progress,
        targetFingerprint: TARGET_A,
      }),
    ).toBe(REPAIR_CREATED_TOKEN_BATCH_IMPORT_ABSENCE_REASONS.NOTHING_PENDING)
    await expect(
      resolveRepairCreatedTokenBatchImportCandidate({
        progress,
        accounts: [account],
        targetFingerprint: TARGET_A,
        freshness: REPAIR_CREATED_TOKEN_BATCH_IMPORT_FRESHNESS.CURRENT_SESSION,
      }),
    ).resolves.toBeNull()
    expect(mocks.createDisplayAccountApiContext).not.toHaveBeenCalled()

    mocks.createDisplayAccountApiContext.mockReturnValue(
      createApiContext({
        tokens: [
          createToken({ id: 11, group: "alpha" }) as ApiToken,
          createToken({ id: 12, group: "beta" }) as ApiToken,
        ],
      }).context,
    )

    const regularCandidate =
      await resolveRepairCreatedTokenBatchImportCandidate({
        progress,
        accounts: [account],
        targetFingerprint: TARGET_A,
        freshness: REPAIR_CREATED_TOKEN_BATCH_IMPORT_FRESHNESS.CURRENT_SESSION,
        includeCompletedReferences: true,
        forceCompleteVerification: true,
      })

    expect(regularCandidate?.intent.verification).toBe(
      MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS.COMPLETE,
    )
    expect(
      regularCandidate?.items
        .filter(isResolvedManagedSiteTokenBatchExportItemInput)
        .map(({ runtimeKey }) => runtimeKey.id),
    ).toEqual([
      buildAccountTokenRuntimeKeyId(account.id, 11),
      buildAccountTokenRuntimeKeyId(account.id, 12),
    ])
  })

  it("uses complete verification for historical results or an explicit complete-check request", async () => {
    const account = buildAccount("account-1")
    const progress = buildProgress([
      buildRepairResult(account.id, {
        createdGroups: ["alpha"],
        createdTokens: [{ tokenId: 11, group: "alpha" }],
      }),
    ])
    mocks.createDisplayAccountApiContext.mockReturnValue(
      createApiContext({
        tokens: [createToken({ id: 11, group: "alpha" }) as ApiToken],
      }).context,
    )

    const historical = await resolveRepairCreatedTokenBatchImportCandidate({
      progress,
      accounts: [account],
      targetFingerprint: TARGET_A,
      freshness: REPAIR_CREATED_TOKEN_BATCH_IMPORT_FRESHNESS.HISTORICAL,
    })
    const explicitlyComplete =
      await resolveRepairCreatedTokenBatchImportCandidate({
        progress,
        accounts: [account],
        targetFingerprint: TARGET_A,
        freshness: REPAIR_CREATED_TOKEN_BATCH_IMPORT_FRESHNESS.CURRENT_SESSION,
        forceCompleteVerification: true,
      })

    expect(historical?.intent.verification).toBe(
      MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS.COMPLETE,
    )
    expect(explicitlyComplete?.intent.verification).toBe(
      MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS.COMPLETE,
    )
  })

  it("returns no launch candidate for old progress without exact references", async () => {
    const account = buildAccount("account-1")
    const progress = buildProgress([
      buildRepairResult(account.id, {
        createdGroups: ["alpha"],
        createdTokens: undefined,
      }),
    ])

    await expect(
      resolveRepairCreatedTokenBatchImportCandidate({
        progress,
        accounts: [account],
        targetFingerprint: TARGET_A,
        freshness: REPAIR_CREATED_TOKEN_BATCH_IMPORT_FRESHNESS.HISTORICAL,
      }),
    ).resolves.toBeNull()
    expect(
      getRepairCreatedTokenBatchImportAbsenceReason({
        progress,
        targetFingerprint: TARGET_A,
      }),
    ).toBe(
      REPAIR_CREATED_TOKEN_BATCH_IMPORT_ABSENCE_REASONS.REFERENCES_UNAVAILABLE,
    )
    expect(mocks.createDisplayAccountApiContext).not.toHaveBeenCalled()
  })

  it("returns no launch candidate for a completed job with an empty exact-reference list", async () => {
    const account = buildAccount("account-1")
    const progress = buildProgress([
      buildRepairResult(account.id, {
        createdGroups: [],
        createdTokens: [],
      }),
    ])

    expect(
      getRepairCreatedTokenBatchImportAbsenceReason({
        progress,
        targetFingerprint: TARGET_A,
      }),
    ).toBe(
      REPAIR_CREATED_TOKEN_BATCH_IMPORT_ABSENCE_REASONS.REFERENCES_UNAVAILABLE,
    )
    await expect(
      resolveRepairCreatedTokenBatchImportCandidate({
        progress,
        accounts: [account],
        targetFingerprint: TARGET_A,
        freshness: REPAIR_CREATED_TOKEN_BATCH_IMPORT_FRESHNESS.CURRENT_SESSION,
      }),
    ).resolves.toBeNull()
    expect(mocks.createDisplayAccountApiContext).not.toHaveBeenCalled()
  })

  it("keeps explicitly recorded groups visible when reference recovery was ambiguous", async () => {
    const account = buildAccount("account-1")

    const candidate = await resolveRepairCreatedTokenBatchImportCandidate({
      progress: buildProgress([
        buildRepairResult(account.id, {
          createdGroups: ["alpha"],
          createdTokens: [],
        }),
      ]),
      accounts: [account],
      targetFingerprint: TARGET_A,
      freshness: REPAIR_CREATED_TOKEN_BATCH_IMPORT_FRESHNESS.CURRENT_SESSION,
    })

    expect(candidate?.intent.verification).toBe(
      MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS.COMPLETE,
    )
    expect(candidate?.items).toEqual([
      expect.objectContaining({
        id: `repair-created:${account.id}:alpha`,
        kind: MANAGED_SITE_TOKEN_BATCH_EXPORT_INPUT_KINDS.BLOCKED_REFERENCE,
      }),
    ])
    expect(mocks.createDisplayAccountApiContext).not.toHaveBeenCalled()
  })

  it("does not resolve a token when stored references conflict on its group", async () => {
    const account = buildAccount("account-1")
    mocks.createDisplayAccountApiContext.mockReturnValue(
      createApiContext({
        tokens: [createToken({ id: 11, group: "alpha" }) as ApiToken],
      }).context,
    )

    const candidate = await resolveRepairCreatedTokenBatchImportCandidate({
      progress: buildProgress([
        buildRepairResult(account.id, {
          createdGroups: ["alpha", "beta"],
          createdTokens: [
            { tokenId: 11, group: "alpha" },
            { tokenId: 11, group: "beta" },
          ],
        }),
      ]),
      accounts: [account],
      targetFingerprint: TARGET_A,
      freshness: REPAIR_CREATED_TOKEN_BATCH_IMPORT_FRESHNESS.CURRENT_SESSION,
    })

    expect(
      candidate?.items.filter(isResolvedManagedSiteTokenBatchExportItemInput),
    ).toHaveLength(0)
    expect(
      candidate?.items.filter(isBlockedManagedSiteTokenBatchExportItemInput),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: `repair-created:${account.id}:alpha`,
        }),
        expect.objectContaining({
          id: `repair-created:${account.id}:beta`,
        }),
      ]),
    )
    expect(mocks.createDisplayAccountApiContext).not.toHaveBeenCalled()
  })

  it("returns no launch candidate until the repair job is completed", async () => {
    const account = buildAccount("account-1")

    await expect(
      resolveRepairCreatedTokenBatchImportCandidate({
        progress: buildProgress(
          [
            buildRepairResult(account.id, {
              createdGroups: ["alpha"],
              createdTokens: [{ tokenId: 11, group: "alpha" }],
            }),
          ],
          { state: ACCOUNT_KEY_REPAIR_JOB_STATES.Running },
        ),
        accounts: [account],
        targetFingerprint: TARGET_A,
        freshness: REPAIR_CREATED_TOKEN_BATCH_IMPORT_FRESHNESS.CURRENT_SESSION,
      }),
    ).resolves.toBeNull()
    expect(mocks.createDisplayAccountApiContext).not.toHaveBeenCalled()
  })
})
