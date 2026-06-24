import { describe, expect, it } from "vitest"

import {
  filterRepairInvalidTokens,
  filterRepairResults,
  getRepairOutcomeCounts,
  getRepairProgressBarColor,
  getRepairProgressTotals,
} from "~/features/KeyManagement/components/repairMissingKeysDialogHelpers"
import type {
  AccountKeyRepairAccountResult,
  AccountKeyRepairInvalidToken,
  AccountKeyRepairProgress,
} from "~/types/accountKeyAutoProvisioning"
import {
  ACCOUNT_KEY_REPAIR_INVALID_TOKEN_REASONS,
  ACCOUNT_KEY_REPAIR_JOB_STATES,
  ACCOUNT_KEY_REPAIR_OUTCOMES,
} from "~/types/accountKeyAutoProvisioning"

function buildProgress(
  overrides: Partial<AccountKeyRepairProgress> = {},
): AccountKeyRepairProgress {
  return {
    jobId: "job-1",
    state: ACCOUNT_KEY_REPAIR_JOB_STATES.Running,
    totals: {
      enabledAccounts: 1,
      eligibleAccounts: 1,
      processedAccounts: 0,
    },
    summary: {
      created: 0,
      alreadyHad: 0,
      skipped: 0,
      failed: 0,
    },
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
    outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Created,
    availableGroups: ["default"],
    coveredGroups: ["default"],
    createdGroups: [],
    missingGroups: [],
    finishedAt: 1,
    ...overrides,
  }
}

function buildInvalidToken(
  overrides: Partial<AccountKeyRepairInvalidToken> = {},
): AccountKeyRepairInvalidToken {
  return {
    accountId: "account-1",
    accountName: "Enabled Site",
    siteType: "new-api",
    siteUrlOrigin: "https://enabled.example.invalid",
    tokenId: 1,
    tokenName: "old group key",
    group: "legacy",
    reason: ACCOUNT_KEY_REPAIR_INVALID_TOKEN_REASONS.GroupUnavailable,
    ...overrides,
  }
}

describe("repairMissingKeysDialogHelpers", () => {
  it("filters repair results by outcome and searchable account/group fields", () => {
    const results = [
      buildResult(),
      buildResult({
        accountId: "account-2",
        accountName: "Another Site",
        siteType: "sub2api",
        siteUrlOrigin: "https://another.example.invalid",
        outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Failed,
        missingGroups: ["legacy"],
      }),
      buildResult({
        accountId: "account-3",
        accountName: "Skipped Site",
        outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Skipped,
      }),
    ]

    expect(
      filterRepairResults({
        outcomeFilter: ACCOUNT_KEY_REPAIR_OUTCOMES.Failed,
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
        outcomeFilter: ACCOUNT_KEY_REPAIR_OUTCOMES.Created,
        results,
        searchTerm: "another",
      }),
    ).toEqual([])
  })

  it("filters invalid tokens by token, account, origin, site type, and group", () => {
    const tokens = [
      buildInvalidToken(),
      buildInvalidToken({
        accountId: "account-2",
        accountName: "Other Site",
        siteType: "one-api",
        siteUrlOrigin: "https://other.example.invalid",
        tokenId: 2,
        tokenName: "orphaned key",
        group: "removed",
      }),
    ]

    expect(filterRepairInvalidTokens(tokens, "orphaned")).toEqual([tokens[1]])
    expect(filterRepairInvalidTokens(tokens, "legacy")).toEqual([tokens[0]])
    expect(filterRepairInvalidTokens(tokens, "one-api")).toEqual([tokens[1]])
    expect(filterRepairInvalidTokens(tokens, "missing")).toEqual([])
  })

  it("counts outcomes for the visible repair results", () => {
    expect(
      getRepairOutcomeCounts([
        buildResult(),
        buildResult({ outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Created }),
        buildResult({ outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.AlreadyHad }),
        buildResult({ outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Skipped }),
        buildResult({ outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Failed }),
      ]),
    ).toEqual({
      created: 2,
      alreadyHad: 1,
      skipped: 1,
      failed: 1,
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
          summary: {
            created: 1,
            alreadyHad: 0,
            skipped: 0,
            failed: 1,
          },
        }),
      ),
    ).toBe("bg-amber-600 dark:bg-amber-500")
  })
})
