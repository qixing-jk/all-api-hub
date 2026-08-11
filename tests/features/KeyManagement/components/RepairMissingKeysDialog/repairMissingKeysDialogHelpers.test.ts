import { describe, expect, it } from "vitest"

import {
  filterRepairInvalidResources,
  filterRepairResults,
  getInvalidResourceKey,
  getRepairOutcomeCounts,
  getRepairProgressBarColor,
  getRepairProgressTotals,
} from "~/features/KeyManagement/components/RepairMissingKeysDialog/repairMissingKeysDialogHelpers"
import { ACCOUNT_KEY_RECONCILIATION_OUTCOMES } from "~/services/accounts/accountKeyInventoryReconciliation"
import {
  ACCOUNT_KEY_REQUIREMENT_PROVISIONING_KINDS,
  ACCOUNT_KEY_REQUIREMENT_PROVISIONING_REASONS,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import type {
  AccountKeyRepairAccountResult,
  AccountKeyRepairInvalidResource,
  AccountKeyRepairProgress,
} from "~/types/accountKeyAutoProvisioning"
import {
  ACCOUNT_KEY_REPAIR_JOB_STATES,
  ACCOUNT_KEY_REPAIR_OUTCOMES,
  ACCOUNT_KEY_REPAIR_PROGRESS_SCHEMA_VERSION,
} from "~/types/accountKeyAutoProvisioning"

const emptySummary: AccountKeyRepairProgress["summary"] = {
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
}

function buildProgress(
  overrides: Partial<AccountKeyRepairProgress> = {},
): AccountKeyRepairProgress {
  return {
    schemaVersion: ACCOUNT_KEY_REPAIR_PROGRESS_SCHEMA_VERSION,
    jobId: "job-1",
    state: ACCOUNT_KEY_REPAIR_JOB_STATES.Running,
    totals: {
      enabledAccounts: 1,
      eligibleAccounts: 1,
      processedAccounts: 0,
    },
    summary: emptySummary,
    results: [],
    ...overrides,
  }
}

function buildResult(
  overrides: Partial<AccountKeyRepairAccountResult> = {},
): AccountKeyRepairAccountResult {
  return {
    accountId: "account-1",
    accountName: "Enabled Site",
    siteType: "new-api",
    siteUrlOrigin: "https://enabled.example.invalid",
    outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Covered,
    requirementResults: [
      {
        requirement: {
          requirementKey: "opaque-default",
          displayName: "Default plan",
          provisioning: {
            kind: ACCOUNT_KEY_REQUIREMENT_PROVISIONING_KINDS.Automatic,
          },
        },
        outcome: ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Covered,
      },
    ],
    createdRefs: [],
    invalidResources: [],
    renameResults: [],
    finishedAt: 1,
    ...overrides,
  }
}

function buildInvalidResource(
  overrides: Partial<AccountKeyRepairInvalidResource> = {},
): AccountKeyRepairInvalidResource {
  return {
    accountId: "account-1",
    accountName: "Enabled Site",
    siteType: "new-api",
    siteUrlOrigin: "https://enabled.example.invalid",
    ref: {
      accountId: "account-1",
      siteType: "new-api",
      scopeKey: "account",
      resourceId: "resource-1",
    },
    displayLabel: "Old plan key",
    reason: "orphaned-placement",
    ...overrides,
  }
}

describe("repairMissingKeysDialogHelpers", () => {
  it("filters repair results by current outcome and requirement display name", () => {
    const results = [
      buildResult(),
      buildResult({
        accountId: "account-2",
        accountName: "Another Site",
        siteType: "sub2api",
        siteUrlOrigin: "https://another.example.invalid",
        outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Partial,
        requirementResults: [
          {
            requirement: {
              requirementKey: "opaque-legacy",
              displayName: "Legacy plan",
              provisioning: {
                kind: ACCOUNT_KEY_REQUIREMENT_PROVISIONING_KINDS.InputRequired,
                reasonCode:
                  ACCOUNT_KEY_REQUIREMENT_PROVISIONING_REASONS.FiniteQuotaRequired,
              },
            },
            outcome: ACCOUNT_KEY_RECONCILIATION_OUTCOMES.BlockedInputRequired,
          },
        ],
      }),
      buildResult({
        accountId: "account-3",
        accountName: "Skipped Site",
        outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Skipped,
      }),
    ]

    expect(
      filterRepairResults({
        outcomeFilter: ACCOUNT_KEY_REPAIR_OUTCOMES.Partial,
        results,
        searchTerm: "",
      }),
    ).toEqual([results[1]])
    expect(
      filterRepairResults({
        outcomeFilter: null,
        results,
        searchTerm: "legacy",
      }),
    ).toEqual([results[1]])
    expect(
      filterRepairResults({
        outcomeFilter: ACCOUNT_KEY_REPAIR_OUTCOMES.Covered,
        results,
        searchTerm: "another",
      }),
    ).toEqual([])
  })

  it("filters invalid resources by display label, ref, account, origin, and site type", () => {
    const resources = [
      buildInvalidResource(),
      buildInvalidResource({
        accountId: "account-2",
        accountName: "Other Site",
        siteType: "one-api",
        siteUrlOrigin: "https://other.example.invalid",
        ref: {
          accountId: "account-2",
          siteType: "one-api",
          scopeKey: "account",
          resourceId: "resource-2",
        },
        displayLabel: "Orphaned key",
      }),
    ]

    expect(filterRepairInvalidResources(resources, "orphaned key")).toEqual([
      resources[1],
    ])
    expect(filterRepairInvalidResources(resources, "resource-1")).toEqual([
      resources[0],
    ])
    expect(filterRepairInvalidResources(resources, "one-api")).toEqual([
      resources[1],
    ])
    expect(filterRepairInvalidResources(resources, "Other Site")).toEqual([
      resources[1],
    ])
    expect(
      filterRepairInvalidResources(resources, "other.example.invalid"),
    ).toEqual([resources[1]])
    expect(filterRepairInvalidResources(resources, "missing")).toEqual([])
  })

  it("uses the full resource ref identity for invalid-resource selection", () => {
    const base = buildInvalidResource()
    const otherScope = buildInvalidResource({
      ref: { ...base.ref, scopeKey: "workspace" },
    })

    expect(getInvalidResourceKey(base)).not.toBe(
      getInvalidResourceKey(otherScope),
    )
  })

  it("counts all six current outcomes for visible repair results", () => {
    expect(
      getRepairOutcomeCounts([
        buildResult({ outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Covered }),
        buildResult({ outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Repaired }),
        buildResult({ outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Partial }),
        buildResult({ outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Blocked }),
        buildResult({ outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Skipped }),
        buildResult({ outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Failed }),
      ]),
    ).toEqual({
      covered: 1,
      repaired: 1,
      partial: 1,
      blocked: 1,
      skipped: 1,
      failed: 1,
    })
  })

  it("uses only current processedAccounts for progress", () => {
    expect(
      getRepairProgressTotals(
        buildProgress({
          totals: {
            enabledAccounts: 3,
            eligibleAccounts: 2,
            processedAccounts: 1,
          },
        }),
      ),
    ).toEqual({
      eligibleTotal: 2,
      processedTotal: 1,
      progressMax: 2,
      progressPercent: 50,
    })
  })

  it("uses a zero progress percentage when no account is eligible", () => {
    expect(
      getRepairProgressTotals(
        buildProgress({
          totals: {
            enabledAccounts: 1,
            eligibleAccounts: 0,
            processedAccounts: 0,
          },
        }),
      ),
    ).toEqual({
      eligibleTotal: 0,
      processedTotal: 0,
      progressMax: 1,
      progressPercent: 0,
    })
  })

  it("uses the warning progress color for completed runs with failures", () => {
    expect(
      getRepairProgressBarColor(
        buildProgress({
          state: ACCOUNT_KEY_REPAIR_JOB_STATES.Completed,
          summary: { ...emptySummary, complete: 1, failed: 1 },
        }),
      ),
    ).toBe("bg-amber-600 dark:bg-amber-500")
  })
})
