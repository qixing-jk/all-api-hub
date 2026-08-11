import type { TFunction } from "i18next"
import { describe, expect, it } from "vitest"

import {
  filterRepairInvalidResources,
  filterRepairResults,
  getInvalidResourceKey,
  getInvalidResourceReasonLabel,
  getInventoryIssueLabel,
  getLegacyRepairFailure,
  getRepairFailureMessage,
  getRepairOutcomeCounts,
  getRepairOutcomeLabel,
  getRepairProgressBarColor,
  getRepairProgressTotals,
  getRepairResultViewLabel,
  getRequirementOutcomeLabel,
  getSkipReasonLabel,
  hasRepairAttentionOutcomes,
  isSuccessfulRepairOutcome,
  REPAIR_RESULT_VIEWS,
} from "~/features/KeyManagement/components/RepairMissingKeysDialog/repairMissingKeysDialogHelpers"
import {
  ACCOUNT_KEY_RECONCILIATION_INVALID_REASONS,
  ACCOUNT_KEY_RECONCILIATION_INVENTORY_ISSUES,
  ACCOUNT_KEY_RECONCILIATION_OUTCOMES,
} from "~/services/accounts/accountKeyInventoryReconciliation"
import {
  ACCOUNT_KEY_REQUIREMENT_PROVISIONING_KINDS,
  ACCOUNT_KEY_REQUIREMENT_PROVISIONING_REASONS,
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES,
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
  ACCOUNT_KEY_REPAIR_SKIP_REASONS,
} from "~/types/accountKeyAutoProvisioning"

const t = ((key: string, options?: Record<string, unknown>) =>
  options ? `${key}:${JSON.stringify(options)}` : key) as unknown as TFunction

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
  it.each([
    [
      ACCOUNT_KEY_RESOURCE_FAILURE_CODES.ConfigurationRequired,
      "configurationRequired",
    ],
    [
      ACCOUNT_KEY_RESOURCE_FAILURE_CODES.InvalidConfiguration,
      "invalidConfiguration",
    ],
    [
      ACCOUNT_KEY_RESOURCE_FAILURE_CODES.AuthenticationFailed,
      "authenticationFailed",
    ],
    [ACCOUNT_KEY_RESOURCE_FAILURE_CODES.PermissionDenied, "permissionDenied"],
    [ACCOUNT_KEY_RESOURCE_FAILURE_CODES.ValidationFailed, "validationFailed"],
    [ACCOUNT_KEY_RESOURCE_FAILURE_CODES.NotFound, "notFound"],
    [
      ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain,
      "mutationStateUncertain",
    ],
    [ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable, "unavailable"],
    [ACCOUNT_KEY_RESOURCE_FAILURE_CODES.UpstreamRejected, "upstreamRejected"],
    [ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Aborted, "aborted"],
    [ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected, "unexpected"],
  ])("provides local guidance for %s failures", (code, suffix) => {
    expect(getRepairFailureMessage(t, { code })).toBe(
      `keyManagement:repairMissingKeys.failureGuidance.${suffix}`,
    )
  })

  it("prefers unique provider details and restores only controlled legacy failures", () => {
    expect(
      getRepairFailureMessage(t, {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected,
        message: " provider detail ",
        upstreamCode: "provider detail",
      }),
    ).toBe("provider detail")
    expect(
      getRepairFailureMessage(t, {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected,
        upstreamCode: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable,
      }),
    ).toBe("keyManagement:repairMissingKeys.failureGuidance.unexpected")
    expect(
      getLegacyRepairFailure(
        ` ${ACCOUNT_KEY_RESOURCE_FAILURE_CODES.NotFound} `,
      ),
    ).toEqual({ code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.NotFound })
    expect(getLegacyRepairFailure("provider detail")).toBeUndefined()
    expect(getLegacyRepairFailure(undefined)).toBeUndefined()
  })

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

  it("maps every repair, requirement, skip, and view label to its owned key", () => {
    for (const outcome of Object.values(ACCOUNT_KEY_REPAIR_OUTCOMES)) {
      expect(getRepairOutcomeLabel(t, outcome)).toContain(
        "keyManagement:repairMissingKeys.outcomes.",
      )
    }
    for (const outcome of Object.values(ACCOUNT_KEY_RECONCILIATION_OUTCOMES)) {
      expect(getRequirementOutcomeLabel(t, outcome)).toContain(
        "keyManagement:repairMissingKeys.requirements.",
      )
    }
    for (const reason of Object.values(ACCOUNT_KEY_REPAIR_SKIP_REASONS)) {
      expect(getSkipReasonLabel(t, reason)).toContain(
        "keyManagement:repairMissingKeys.skipReasons.",
      )
    }
    expect(getSkipReasonLabel(t, undefined)).toBe("")
    expect(
      getRepairResultViewLabel(t, REPAIR_RESULT_VIEWS.AccountCoverage),
    ).toBe("keyManagement:repairMissingKeys.views.accountCoverage")
    expect(getRepairResultViewLabel(t, REPAIR_RESULT_VIEWS.InvalidKeys)).toBe(
      "keyManagement:repairMissingKeys.views.invalidKeys",
    )
    expect(isSuccessfulRepairOutcome(ACCOUNT_KEY_REPAIR_OUTCOMES.Covered)).toBe(
      true,
    )
    expect(
      isSuccessfulRepairOutcome(ACCOUNT_KEY_REPAIR_OUTCOMES.Repaired),
    ).toBe(true)
    expect(isSuccessfulRepairOutcome(ACCOUNT_KEY_REPAIR_OUTCOMES.Partial)).toBe(
      false,
    )
  })

  it("keeps native invalid-resource reasons useful when no translation exists", () => {
    expect(
      getInvalidResourceReasonLabel(
        t,
        buildInvalidResource({
          reason: ACCOUNT_KEY_RECONCILIATION_INVALID_REASONS.OrphanedPlacement,
        }),
      ),
    ).toBe(
      "keyManagement:repairMissingKeys.invalidKeys.reasons.orphanedPlacement",
    )

    const passthroughT = ((key: string) => key) as unknown as TFunction
    expect(
      getInvalidResourceReasonLabel(
        passthroughT,
        buildInvalidResource({ reason: "provider-owned-reason" }),
      ),
    ).toBe("provider-owned-reason")
    expect(
      getInvalidResourceReasonLabel(
        t,
        buildInvalidResource({ reason: "provider-owned-reason" }),
      ),
    ).toContain('"reason":"provider-owned-reason"')
  })

  it("maps every controlled inventory issue with its count where applicable", () => {
    for (const code of Object.values(
      ACCOUNT_KEY_RECONCILIATION_INVENTORY_ISSUES,
    )) {
      expect(getInventoryIssueLabel(t, { code, count: 2 })).toContain(
        "keyManagement:repairMissingKeys.inventoryIssues.",
      )
    }
  })

  it.each([
    "partial",
    "blocked",
    "failed",
    "invalidResources",
    "rejectedRequirements",
    "uncertainRequirements",
    "renameRejected",
    "renameUncertain",
    "deleteRejected",
    "deleteUncertain",
  ] as const)("treats %s as requiring attention", (counter) => {
    expect(hasRepairAttentionOutcomes({ ...emptySummary, [counter]: 1 })).toBe(
      true,
    )
  })

  it("distinguishes failed, cancelled, successful, and running progress colors", () => {
    expect(hasRepairAttentionOutcomes(emptySummary)).toBe(false)
    expect(
      getRepairProgressBarColor(
        buildProgress({ state: ACCOUNT_KEY_REPAIR_JOB_STATES.Failed }),
      ),
    ).toBe("bg-red-600 dark:bg-red-500")
    expect(
      getRepairProgressBarColor(
        buildProgress({ state: ACCOUNT_KEY_REPAIR_JOB_STATES.Cancelled }),
      ),
    ).toBe("bg-amber-600 dark:bg-amber-500")
    expect(
      getRepairProgressBarColor(
        buildProgress({ state: ACCOUNT_KEY_REPAIR_JOB_STATES.Completed }),
      ),
    ).toBe("bg-emerald-600 dark:bg-emerald-500")
    expect(getRepairProgressBarColor(buildProgress())).toBe(
      "bg-blue-600 dark:bg-blue-500",
    )
  })
})
