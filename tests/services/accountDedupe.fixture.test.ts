import { describe, expect, it } from "vitest"

import { scanDuplicateAccounts } from "~/services/accounts/accountDedupe"
import { normalizeSiteAccount } from "~/services/accounts/accountDefaults"
import {
  normalizeBackupForMerge,
  parseBackupSummary,
} from "~/services/importExport/importExportService"
import fixture from "~~/tests/fixtures/accounts/suspected-duplicates.json"

describe("importable duplicate detection demo", () => {
  it("preserves the documented matches after import normalization", () => {
    expect(
      parseBackupSummary(JSON.stringify(fixture), "unknown"),
    ).toMatchObject({ valid: true, hasAccounts: true, hasPreferences: false })
    const imported = normalizeBackupForMerge(fixture, null)
    const accounts = imported.accounts.map(normalizeSiteAccount)
    expect(accounts).toHaveLength(8)
    expect(
      accounts.every(
        (account) =>
          account.disabled &&
          account.excludeFromTotalBalance &&
          !account.checkIn.automaticExecutionEnabled,
      ),
    ).toBe(true)
    const result = scanDuplicateAccounts({ accounts, strategy: "keepPinned" })
    expect(result.unscannable).toEqual([])
    expect(result.groups.map((group) => group.deleteAccountIds)).toEqual([
      ["dedupe-demo-exact-old"],
    ])
    expect(
      result.suspectedGroups.map((group) =>
        group.accounts.map((account) => account.id).sort(),
      ),
    ).toEqual([
      ["dedupe-demo-domain-new", "dedupe-demo-domain-old"],
      ["dedupe-demo-name-new", "dedupe-demo-name-old"],
    ])
  })
})
