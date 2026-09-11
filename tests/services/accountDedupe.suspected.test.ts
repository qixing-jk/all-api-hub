import { describe, expect, it } from "vitest"

import { scanDuplicateAccounts } from "~/services/accounts/accountDedupe"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

/** Build stored users with independent names and addresses. */
function account(id: string, url: string, name: string, userId = "42") {
  return buildSiteAccount({
    id,
    site_url: url,
    site_name: name,
    site_type: "new-api",
    account_info: { ...buildSiteAccount().account_info, id: userId },
  })
}

/** Run the public scanner using the default keep strategy. */
function scan(accounts: ReturnType<typeof account>[]) {
  return scanDuplicateAccounts({ accounts, strategy: "keepPinned" })
}

describe("suspected account duplicates", () => {
  it("finds renamed domains using normalized site names without recommending deletion", () => {
    const result = scan([
      account("a", "https://old.example.com", " My Site "),
      account("b", "https://new.example.net", "my  site"),
    ])
    expect(result.groups).toEqual([])
    expect(result.suspectedGroups).toMatchObject([
      {
        userId: "42",
        siteName: "my site",
        accounts: [{ id: "a" }, { id: "b" }],
      },
    ])
    expect(result.suspectedGroups[0]).not.toHaveProperty("deleteAccountIds")
  })

  it("matches registrable domains with multi-label public suffixes", () => {
    const result = scan([
      account("a", "https://api.example.co.uk", "Old"),
      account("b", "https://console.example.co.uk", "New"),
    ])
    expect(result.suspectedGroups).toMatchObject([
      { rootDomain: "example.co.uk" },
    ])
  })

  it.each([
    ["https://one.co.uk", "https://two.co.uk"],
    ["https://one.github.io", "https://two.github.io"],
    ["http://127.0.0.1", "http://127.0.0.2"],
    ["http://localhost:3000", "http://localhost:4000"],
  ])("does not infer a shared domain for %s and %s", (a, b) => {
    expect(
      scan([account("a", a, "First"), account("b", b, "Second")])
        .suspectedGroups,
    ).toEqual([])
  })

  it("requires a known matching user ID even when both site signals match", () => {
    for (const id of ["43", "", " "]) {
      expect(
        scan([
          account("a", "https://api.example.com", "Site"),
          account("b", "https://console.example.com", "Site", id),
        ]).suspectedGroups,
      ).toEqual([])
    }
  })

  it("merges identical candidate sets and preserves exact groups", () => {
    const a = account("a", "https://api.example.com", "Site")
    const b = account("b", "https://console.example.com", "Site")
    expect(scan([a, b]).suspectedGroups).toMatchObject([
      { siteName: "site", rootDomain: "example.com" },
    ])
    expect(scan([a, b]).suspectedGroups).toHaveLength(1)
    const result = scan([a, { ...a, id: "copy" }, b])
    expect(result.groups).toHaveLength(1)
    expect(result.suspectedGroups).toHaveLength(1)
    expect(scan([a, { ...a, id: "copy" }]).suspectedGroups).toEqual([])
  })

  it("does not transitively combine different site signals", () => {
    const result = scan([
      account("a", "https://old.example.net", "Site"),
      account("b", "https://api.example.com", "Site"),
      account("c", "https://console.example.com", "Other"),
    ])
    expect(
      result.suspectedGroups.map((group) =>
        group.accounts.map((account) => account.id),
      ),
    ).toEqual([
      ["a", "b"],
      ["b", "c"],
    ])
  })

  it("skips invalid URLs and credential-owned account identities", () => {
    const a = account("a", "https://old.example.com", "Site")
    expect(
      scan([a, account("b", "https://[", "Site")]).suspectedGroups,
    ).toEqual([])
    expect(
      scan([
        { ...a, site_type: "openrouter" },
        {
          ...account("b", "https://new.example.net", "Site"),
          site_type: "openrouter",
        },
      ]).suspectedGroups,
    ).toEqual([])
  })
})
