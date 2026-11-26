import { beforeEach, describe, expect, it, vi } from "vitest"

import { ACCOUNT_SITE_TYPE_VALUES } from "~/constants/siteType"
import {
  addDevFinancialFixtureAccounts,
  addDevFixtureAccounts,
  clearDevFixtureAccounts,
  countDevFixtureAccounts,
  DEV_FIXTURE_NOTES_LABEL,
} from "~/features/DevPanel/fixtureAccounts"
import { DEV_FINANCIAL_FIXTURE_KINDS } from "~/features/DevPanel/fixtureScenarioKinds"
import type { AccountAllowanceEntry } from "~/services/accounts/allowances"
import type { BalancePosition } from "~/services/amounts/balance"
import { BALANCE_LABEL_KEYS } from "~/services/amounts/financialConstants"
import { STORAGE_KEYS } from "~/services/core/storageKeys"

const { addAccountMock, deleteAccountsMock, getAllAccountsMock } = vi.hoisted(
  () => ({
    addAccountMock: vi.fn(),
    deleteAccountsMock: vi.fn(),
    getAllAccountsMock: vi.fn(),
  }),
)

vi.mock("~/services/accounts/accountStorage/accountMutations", () => ({
  accountMutations: {
    addAccount: addAccountMock,
    deleteAccounts: deleteAccountsMock,
  },
}))

vi.mock("~/services/accounts/accountStorage/accountQueries", () => ({
  accountQueries: {
    getAllAccounts: getAllAccountsMock,
    getAllAccountsOrThrow: getAllAccountsMock,
  },
}))

/** In-memory stand-in for the extension `local` storage area. */
const storageBacking = new Map<string, unknown>()
let storageGetShouldThrow = false
let storageSetShouldThrow = false

vi.mock("@plasmohq/storage", () => ({
  Storage: class {
    async get(key: string) {
      if (storageGetShouldThrow) {
        throw new Error("storage unavailable")
      }
      return storageBacking.get(key)
    }

    async set(key: string, value: unknown) {
      if (storageSetShouldThrow) throw new Error("registry write failed")
      storageBacking.set(key, value)
    }

    async remove(key: string) {
      storageBacking.delete(key)
    }
  },
}))

/** Seeds the fixture id registry the way a previous generator run would. */
function seedRegistry(ids: string[]) {
  storageBacking.set(STORAGE_KEYS.DEV_FIXTURE_ACCOUNT_IDS, ids)
}

function readRegistry(): string[] {
  return (storageBacking.get(STORAGE_KEYS.DEV_FIXTURE_ACCOUNT_IDS) ??
    []) as string[]
}

const realAccount = {
  id: "real-1",
  notes: "user notes",
  last_sync_time: 0,
}

describe("dev fixture accounts", () => {
  it("creates native zero, missing and stale examples through the dev generator", async () => {
    await expect(addDevFinancialFixtureAccounts("site-states")).resolves.toBe(
      ACCOUNT_SITE_TYPE_VALUES.length * 3 + 1,
    )
    const accounts = addAccountMock.mock.calls.map(([account]) => account)
    expect(
      accounts.filter((a) => a.site_name.endsWith(" · zero")),
    ).toHaveLength(ACCOUNT_SITE_TYPE_VALUES.length)
    expect(
      accounts.filter((a) => a.site_name.endsWith(" · missing")),
    ).toHaveLength(ACCOUNT_SITE_TYPE_VALUES.length)
    expect(
      accounts.filter((a) => a.site_name.endsWith(" · stale")),
    ).toHaveLength(ACCOUNT_SITE_TYPE_VALUES.length)
  })
  it("mocks native site types with their default units and independent funds", async () => {
    await addDevFinancialFixtureAccounts(DEV_FINANCIAL_FIXTURE_KINDS.SiteTypes)
    const accounts = addAccountMock.mock.calls.map(([account]) => account)
    const find = (type: string) =>
      accounts.find((account) => account.site_type === type)
    expect(find("new-api")?.account_info.balance.positions[0]).toMatchObject({
      asset: { kind: "currency", code: "USD" },
      amount: { value: "10", source: { amountInputs: { quota: "5000000" } } },
    })
    expect(find("shell-api")?.account_info.balance.positions[0]).toMatchObject({
      asset: { kind: "currency", code: "USD" },
      amount: { value: "10", source: { amountInputs: { quota: "5000000" } } },
    })
    expect(find("sub2api")?.account_info.balance.positions[0]).toMatchObject({
      id: "balance",
      collectionKey: "wallet",
      nature: "prepaid",
      asset: { kind: "currency", code: "USD" },
      amount: {
        value: "12.34",
        source: {
          adapter: "sub2api",
          operation: "/api/v1/auth/me:balance",
          contractVersion: "usd/v1",
        },
      },
    })
    expect(find("relayfor")?.account_info.balance.positions).toMatchObject([
      { labelKey: BALANCE_LABEL_KEYS.Permanent, amount: { value: "1.88" } },
      { labelKey: BALANCE_LABEL_KEYS.Timed, amount: { value: "3.76" } },
    ])
    expect(find("kimi")?.account_info.balance.positions[0]).toMatchObject({
      asset: { kind: "currency", code: "CNY" },
      amount: { value: "8" },
    })
    expect(find("dahl")?.account_info.balance.positions[0]).toMatchObject({
      asset: { kind: "quota", displayScale: 1000000, displayLabel: "M Token" },
    })
    expect(
      find("nanogpt")?.account_info.balance.positions.map(
        (p: BalancePosition) => p.asset.kind,
      ),
    ).toEqual(["currency", "crypto"])
    for (const account of accounts)
      expect(new URL(account.site_url).hostname).toMatch(/\.invalid$/)
  })
  beforeEach(() => {
    vi.clearAllMocks()
    storageBacking.clear()
    storageGetShouldThrow = false
    storageSetShouldThrow = false
    addAccountMock.mockImplementation(async () => `fixture-${Date.now()}`)
    deleteAccountsMock.mockResolvedValue({ deletedCount: 0, deletedIds: [] })
    getAllAccountsMock.mockResolvedValue([realAccount])
  })

  it("removes only the just-created accounts when registry persistence fails", async () => {
    seedRegistry(["existing-fixture"])
    let serial = 0
    addAccountMock.mockImplementation(async () => `new-fixture-${++serial}`)
    storageSetShouldThrow = true
    await expect(addDevFinancialFixtureAccounts()).rejects.toThrow(
      "registry write failed",
    )
    expect(deleteAccountsMock).toHaveBeenCalledExactlyOnceWith(
      Array.from({ length: 9 }, (_, index) => `new-fixture-${index + 1}`),
    )
    expect(readRegistry()).toEqual(["existing-fixture"])
  })

  it("preserves both storage errors when fixture rollback fails", async () => {
    const cleanupError = new Error("accounts temporarily read-only")
    deleteAccountsMock.mockRejectedValueOnce(cleanupError)
    storageSetShouldThrow = true

    await expect(addDevFinancialFixtureAccounts()).rejects.toMatchObject({
      cause: cleanupError,
      errors: [
        expect.objectContaining({ message: "registry write failed" }),
        cleanupError,
      ],
    })
  })

  it("generates distinguishable balance and plan scenarios without legacy cashflow or automatic check-in", async () => {
    let serial = 0
    addAccountMock.mockImplementation(async () => `financial-${++serial}`)

    await expect(addDevFinancialFixtureAccounts()).resolves.toBe(9)

    expect(readRegistry()).toHaveLength(9)
    const accounts = addAccountMock.mock.calls.map(([account]) => account)
    for (const account of accounts) {
      expect(new URL(account.site_url).hostname).toMatch(/\.invalid$/)
      expect(account.checkIn.automaticExecutionEnabled).toBe(false)
      expect(account.account_info.quota).toBeUndefined()
      expect(account.account_info.todayStatsAvailability.income.status).toBe(
        "unavailable",
      )
      expect(
        account.account_info.todayStatsAvailability.consumption.status,
      ).toBe("unavailable")
    }
    const byName = (name: string) => accounts.find((a) => a.site_name === name)
    expect(
      byName("Dev Balance: USD wallet").account_info.balance.positions[0].amount
        .value,
    ).toBe("120.5")
    expect(
      byName("Dev Balance: Zero balance").account_info.balance.positions[0]
        .amount.value,
    ).toBe("0")
    expect(
      byName("Dev Balance: Negative balance").account_info.balance.positions[0]
        .amount.value,
    ).toBe("-8.25")
    expect(
      byName("Dev Balance: Multiple assets").account_info.balance.positions.map(
        (p: BalancePosition) => p.asset.kind,
      ),
    ).toEqual(["currency", "currency", "quota"])
    expect(
      byName("Dev Balance: Expiring voucher").account_info.balance.positions[0]
        .instrument,
    ).toBe("voucher")
    expect(
      byName("Dev Balance: Model restriction").account_info.balance.positions[0]
        .scope.models,
    ).toEqual({ kind: "restricted", ids: ["gpt-4.1"] })
    expect(
      byName("Dev Balance: Independent plans").account_info.balance.positions,
    ).toEqual([])
    expect(
      byName(
        "Dev Balance: Independent plans",
      ).account_info.allowances.entries.map(
        (e: AccountAllowanceEntry) => e.constraint.limitState,
      ),
    ).toEqual(["finite", "finite", "unlimited"])
    expect(
      byName("Dev Balance: Stale balance").account_info.balance.positions[0]
        .amount.status,
    ).toBe("stale")
    expect(
      byName("Dev Balance: Unavailable balance").account_info.balance
        .positions[0].amount.status,
    ).toBe("unavailable")
  })

  it("adds fixture accounts, registers their ids, and keeps check-in off", async () => {
    addAccountMock
      .mockResolvedValueOnce("fixture-a")
      .mockResolvedValueOnce("fixture-b")

    const added = await addDevFixtureAccounts(2)

    expect(added).toBe(2)
    expect(addAccountMock).toHaveBeenCalledTimes(2)
    expect(readRegistry()).toEqual(["fixture-a", "fixture-b"])

    const calls = addAccountMock.mock.calls.map(([account]) => account)
    for (const [index, account] of calls.entries()) {
      expect(account.notes).toContain(DEV_FIXTURE_NOTES_LABEL)
      expect(account.site_url).toBe(
        `https://fixture-${String(index + 1).padStart(2, "0")}.local`,
      )
      expect(account.checkIn.automaticExecutionEnabled).toBe(false)
    }

    // Variants cycle through the UI states the fixtures exist to exercise.
    expect(new Set(calls.map((account) => account.notes)).size).toBe(2)
  })

  it("never stamps last_sync_time in the future", async () => {
    const before = Date.now()
    addAccountMock.mockResolvedValue("fixture-a")

    await addDevFixtureAccounts(3)

    for (const [account] of addAccountMock.mock.calls) {
      expect(account.last_sync_time).toBeLessThanOrEqual(before)
    }
    // Ages vary so relative-time rendering has something to show.
    const syncTimes = addAccountMock.mock.calls.map(
      ([account]) => account.last_sync_time,
    )
    expect(new Set(syncTimes).size).toBe(3)
  })

  it("keeps partially saved financial scenarios registered for cleanup after a save fails", async () => {
    seedRegistry(["existing-fixture"])
    addAccountMock
      .mockResolvedValueOnce("financial-a")
      .mockRejectedValueOnce(new Error("storage full"))

    await expect(addDevFinancialFixtureAccounts()).rejects.toThrow(
      "storage full",
    )
    expect(readRegistry()).toEqual(["existing-fixture", "financial-a"])
  })

  it("continues numbering after previously registered fixtures", async () => {
    storageBacking.set(STORAGE_KEYS.DEV_FIXTURE_ACCOUNT_IDS, ["fixture-1"])
    getAllAccountsMock.mockResolvedValue([
      realAccount,
      { id: "fixture-1", notes: `${DEV_FIXTURE_NOTES_LABEL}: healthy` },
    ])
    addAccountMock.mockResolvedValue("fixture-2")

    await addDevFixtureAccounts(1)

    expect(addAccountMock).toHaveBeenCalledWith(
      expect.objectContaining({
        site_name: "Dev Fixture 02",
        site_url: "https://fixture-02.local",
      }),
    )
  })

  it("counts only registered fixtures that still exist", async () => {
    seedRegistry(["fixture-1", "fixture-missing"])
    getAllAccountsMock.mockResolvedValue([
      realAccount,
      { id: "fixture-1", notes: `${DEV_FIXTURE_NOTES_LABEL}: healthy` },
    ])

    await expect(countDevFixtureAccounts()).resolves.toBe(1)
  })

  it("clears registered fixtures without touching look-alike real accounts", async () => {
    seedRegistry(["fixture-1", "fixture-2"])
    // A real account whose notes happen to start like a fixture label must
    // survive: identification comes from the registry, not from notes.
    const lookAlike = {
      id: "real-lookalike",
      notes: `${DEV_FIXTURE_NOTES_LABEL}: healthy`,
      last_sync_time: 0,
    }
    getAllAccountsMock.mockResolvedValue([
      realAccount,
      lookAlike,
      { id: "fixture-1", notes: `${DEV_FIXTURE_NOTES_LABEL}: healthy` },
      { id: "fixture-2", notes: `${DEV_FIXTURE_NOTES_LABEL}: disabled` },
    ])
    deleteAccountsMock.mockResolvedValue({
      deletedCount: 2,
      deletedIds: ["fixture-1", "fixture-2"],
    })

    await expect(clearDevFixtureAccounts()).resolves.toBe(2)
    expect(deleteAccountsMock).toHaveBeenCalledWith(["fixture-1", "fixture-2"])
    expect(readRegistry()).toEqual([])
  })

  it("clears nothing and resets stale ids when no fixtures remain", async () => {
    seedRegistry(["fixture-missing"])

    await expect(clearDevFixtureAccounts()).resolves.toBe(0)
    expect(deleteAccountsMock).not.toHaveBeenCalled()
    expect(readRegistry()).toEqual([])
  })

  it("retains a fixture that was not deleted and fixtures added during cleanup", async () => {
    seedRegistry(["fixture-1", "fixture-2"])
    getAllAccountsMock.mockResolvedValue([
      realAccount,
      { id: "fixture-1" },
      { id: "fixture-2" },
    ])
    deleteAccountsMock.mockImplementation(async () => {
      seedRegistry(["fixture-1", "fixture-2", "concurrent-fixture"])
      return { deletedCount: 1, deletedIds: ["fixture-1"] }
    })
    await expect(clearDevFixtureAccounts()).resolves.toBe(1)
    expect(readRegistry()).toEqual(["fixture-2", "concurrent-fixture"])
  })

  it("reports a partial failure instead of registering ids that were not saved", async () => {
    addAccountMock
      .mockResolvedValueOnce("fixture-a")
      .mockRejectedValueOnce(new Error("storage full"))

    const added = await addDevFixtureAccounts(3)

    expect(added).toBe(1)
    expect(readRegistry()).toEqual(["fixture-a"])
  })
  it("reports zero when the account query fails", async () => {
    getAllAccountsMock.mockRejectedValue(new Error("accounts unavailable"))

    await expect(countDevFixtureAccounts()).resolves.toBe(0)
  })

  it("reports an unavailable count and refuses cleanup when registry reads fail", async () => {
    storageGetShouldThrow = true

    await expect(countDevFixtureAccounts()).resolves.toBe(0)
    // A failed read must not fall back to matching editable account fields.
    await expect(clearDevFixtureAccounts()).rejects.toThrow(
      "storage unavailable",
    )
    expect(deleteAccountsMock).not.toHaveBeenCalled()
  })

  it("refuses to create financial scenarios when the cleanup registry cannot be read", async () => {
    storageGetShouldThrow = true
    await expect(addDevFinancialFixtureAccounts()).rejects.toThrow(
      "storage unavailable",
    )
    expect(addAccountMock).not.toHaveBeenCalled()
  })
})
