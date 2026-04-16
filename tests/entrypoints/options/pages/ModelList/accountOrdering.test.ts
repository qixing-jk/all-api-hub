import { describe, expect, it } from "vitest"

import { sortModelListAccounts } from "~/features/ModelList/accountOrdering"
import { AuthTypeEnum, SiteHealthStatus, type DisplaySiteData } from "~/types"

function createAccount(id: string, name: string): DisplaySiteData {
  return {
    id,
    name,
    username: "tester",
    balance: { USD: 0, CNY: 0 },
    todayConsumption: { USD: 0, CNY: 0 },
    todayIncome: { USD: 0, CNY: 0 },
    todayTokens: { upload: 0, download: 0 },
    health: { status: SiteHealthStatus.Healthy },
    siteType: "new-api",
    baseUrl: `https://${id}.example.com`,
    token: "token",
    userId: 1,
    authType: AuthTypeEnum.AccessToken,
    checkIn: { enableDetection: false },
  }
}

describe("sortModelListAccounts", () => {
  it("sorts successful accounts by model count and pushes failed accounts last", () => {
    const primaryAccount = createAccount("acc-1", "Primary")
    const backupAccount = createAccount("acc-2", "Backup")
    const failedAccount = createAccount("acc-3", "Failed")

    const sortedAccounts = sortModelListAccounts({
      accounts: [primaryAccount, backupAccount, failedAccount],
      accountQueryStates: [
        {
          account: primaryAccount,
          isLoading: false,
          hasError: false,
        },
        {
          account: backupAccount,
          isLoading: false,
          hasError: false,
        },
        {
          account: failedAccount,
          isLoading: false,
          hasError: true,
          errorType: "load-failed",
        },
      ],
      accountSummaryCountsByAccountId: new Map([
        [primaryAccount.id, 1],
        [backupAccount.id, 3],
        [failedAccount.id, 99],
      ]),
    })

    expect(sortedAccounts.map((account) => account.id)).toEqual([
      backupAccount.id,
      primaryAccount.id,
      failedAccount.id,
    ])
  })

  it("preserves the original order until every account finishes loading", () => {
    const primaryAccount = createAccount("acc-1", "Primary")
    const backupAccount = createAccount("acc-2", "Backup")

    const sortedAccounts = sortModelListAccounts({
      accounts: [primaryAccount, backupAccount],
      accountQueryStates: [
        {
          account: primaryAccount,
          isLoading: false,
          hasError: false,
        },
        {
          account: backupAccount,
          isLoading: true,
          hasError: false,
        },
      ],
      accountSummaryCountsByAccountId: new Map([
        [primaryAccount.id, 1],
        [backupAccount.id, 3],
      ]),
    })

    expect(sortedAccounts.map((account) => account.id)).toEqual([
      primaryAccount.id,
      backupAccount.id,
    ])
  })

  it("preserves the original order when query states do not cover every account", () => {
    const primaryAccount = createAccount("acc-1", "Primary")
    const backupAccount = createAccount("acc-2", "Backup")

    const sortedAccounts = sortModelListAccounts({
      accounts: [primaryAccount, backupAccount],
      accountQueryStates: [
        {
          account: primaryAccount,
          isLoading: false,
          hasError: false,
        },
        {
          account: primaryAccount,
          isLoading: false,
          hasError: false,
        },
      ],
      accountSummaryCountsByAccountId: new Map([
        [primaryAccount.id, 1],
        [backupAccount.id, 3],
      ]),
    })

    expect(sortedAccounts.map((account) => account.id)).toEqual([
      primaryAccount.id,
      backupAccount.id,
    ])
  })

  it("preserves original order when counts are equal", () => {
    const primaryAccount = createAccount("acc-1", "Primary")
    const backupAccount = createAccount("acc-2", "Backup")
    const tertiaryAccount = createAccount("acc-3", "Tertiary")

    const sortedAccounts = sortModelListAccounts({
      accounts: [primaryAccount, backupAccount, tertiaryAccount],
      accountQueryStates: [
        {
          account: primaryAccount,
          isLoading: false,
          hasError: false,
        },
        {
          account: backupAccount,
          isLoading: false,
          hasError: false,
        },
        {
          account: tertiaryAccount,
          isLoading: false,
          hasError: false,
        },
      ],
      accountSummaryCountsByAccountId: new Map([
        [primaryAccount.id, 2],
        [backupAccount.id, 2],
        [tertiaryAccount.id, 2],
      ]),
    })

    expect(sortedAccounts.map((account) => account.id)).toEqual([
      primaryAccount.id,
      backupAccount.id,
      tertiaryAccount.id,
    ])
  })
})
