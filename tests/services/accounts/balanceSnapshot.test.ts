import { describe, expect, it } from "vitest"

import { CURRENCIES } from "~/constants/money"
import {
  accountBalanceScope,
  accountBalanceSnapshot,
  accountReportingScope,
  getAccountBalanceSnapshots,
  readAccountBalance,
} from "~/services/accounts/balanceSnapshot"
import {
  balancePosition,
  balanceSnapshotSchema,
} from "~/services/amounts/balance"
import {
  addDecimal,
  parseDecimal,
  scaleDecimal,
  subtractDecimal,
} from "~/services/amounts/decimal"
import {
  ASSET_KINDS,
  BALANCE_NATURES,
  BALANCE_RELATIONS,
  BALANCE_ROLES,
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
  FINANCIAL_SUBJECT_KINDS,
} from "~/services/amounts/financialConstants"
import { formatAssetAmount } from "~/utils/core/money"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

const scope = {
  subject: {
    kind: FINANCIAL_SUBJECT_KINDS.Account,
    accountId: "test",
  } as const,
  authority: "https://source.example",
  models: { kind: "unknown" } as const,
  keys: { kind: "unknown" } as const,
  projects: { kind: "unknown" } as const,
  groups: { kind: "unknown" } as const,
}
const source = {
  adapter: "trustedrouter-fixture",
  contractVersion: "bc244eab",
  operation: "/v1/credits",
  kind: EVIDENCE_KINDS.Reported,
} as const
const position = balancePosition({
  id: "balance",
  scope,
  source,
  observedAt: 100,
  asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
  value: "70",
  role: BALANCE_ROLES.Ledger,
  nature: BALANCE_NATURES.Prepaid,
})
const snapshot = {
  schemaVersion: 2,
  subject: scope.subject,
  capturedAt: 100,
  positions: [position],
  coverage: FINANCIAL_COVERAGE.Complete,
}

describe("financial snapshot contract", () => {
  it.each([false, true])(
    "retains saved USD components before refresh, including already migrated evidence (%s)",
    (migrated) => {
      const account = buildSiteAccount()
      const nativeBalance = {
        unit: CURRENCIES.USD,
        total: 35,
        permanent: 10,
        daily: 5,
        components: [
          { kind: "permanent" as const, amount: 10 },
          { kind: "timed" as const, amount: 5 },
          {
            kind: "subscription" as const,
            name: "Existing Plan",
            amount: 20,
            scope: "premium",
            expiresAt: "2099-12-31T00:00:00Z",
          },
        ],
        timedDetails: [
          {
            kind: "timed" as const,
            name: "Saved Gift",
            amount: 5,
            resetAt: "2099-12-30T00:00:00Z",
          },
        ],
      }
      delete account.account_info.balance
      if (migrated) {
        account.account_info.balance = readAccountBalance(
          { nativeBalance },
          accountBalanceScope({
            baseUrl: account.site_url,
            accountId: account.id,
          }),
          account.last_sync_time,
        )
        account.account_info.legacyFinancial = {
          schemaVersion: 1,
          capturedAt: account.last_sync_time,
          nativeBalance,
        }
      } else account.account_info.nativeBalance = nativeBalance
      const restored = getAccountBalanceSnapshots(account).reported
      expect(restored.positions).toContainEqual(
        expect.objectContaining({
          label: "Existing Plan · premium",
          parentId: "legacy",
          asset: { kind: "currency", code: "USD" },
          amount: expect.objectContaining({ status: "stale", value: "20" }),
          reportedTiming: { expiresAt: "2099-12-31T00:00:00Z" },
        }),
      )
      expect(restored.positions).toContainEqual(
        expect.objectContaining({
          label: "Saved Gift",
          amount: expect.objectContaining({ value: "5" }),
          reportedTiming: { resetsAt: "2099-12-30T00:00:00Z" },
        }),
      )
      expect(balanceSnapshotSchema.safeParse(restored).success).toBe(true)
    },
  )
  it("reports an unfiltered account query without changing wallet restrictions or identity", () => {
    const request = {
      baseUrl: "https://source.example/console",
      accountId: "test",
    }
    const identity = { walletId: "upstream-wallet" }
    const report = accountReportingScope(request, identity)
    expect(report).toEqual({
      subject: { kind: "account", accountId: "test" },
      authority: "https://source.example",
      walletId: "upstream-wallet",
      projects: { kind: "all" },
      keys: { kind: "all" },
      models: { kind: "all" },
      groups: { kind: "all" },
    })
    expect(accountBalanceScope(request, identity).models).toEqual({
      kind: "unknown",
    })
  })
  it("restores permanent and daily credits in already migrated accounts", () => {
    const account = buildSiteAccount()
    const nativeBalance = {
      unit: "credits" as const,
      total: 12,
      permanent: 10,
      daily: 2,
    }
    account.account_info = {
      ...account.account_info,
      balance: readAccountBalance(
        { nativeBalance },
        accountBalanceScope({
          baseUrl: account.site_url,
          accountId: account.id,
        }),
        account.last_sync_time,
      ),
      legacyFinancial: {
        schemaVersion: 1,
        capturedAt: account.last_sync_time,
        nativeBalance,
      },
    }
    expect(getAccountBalanceSnapshots(account).reported.positions).toEqual([
      expect.objectContaining({ id: "legacy" }),
      expect.objectContaining({
        labelKey: "permanentBalance",
        parentId: "legacy",
        amount: expect.objectContaining({ value: "10", status: "stale" }),
      }),
      expect.objectContaining({
        labelKey: "dailyBalance",
        parentId: "legacy",
        amount: expect.objectContaining({ value: "2", status: "stale" }),
      }),
    ])
  })
  it("keeps legacy product quota in its established monetary display without reclassifying it", () => {
    const snapshot = readAccountBalance({ quota: 5000000 }, scope, 10)
    const position = snapshot.positions[0]!
    expect(position.amount).toMatchObject({
      status: "stale",
      value: "10",
      source: { kind: "legacy", amountInputs: { quota: "5000000" } },
    })
    expect(position.nature).toBe("unknown")
    expect(
      formatAssetAmount(
        { asset: position.asset as never, value: "10" },
        "en-US",
      ),
    ).toBe("USD 10")
  })
  it.each([
    [".5", "0.5"],
    ["+.1234567890123456789", "0.1234567890123456789"],
    ["1.", "1"],
    ["0x10", "16"],
    ["-0", "0"],
    ["-0.5", undefined],
    ["", undefined],
  ])(
    "retains supported manual syntax and absence semantics for %s",
    (input, expected) => {
      const account = buildSiteAccount({ manualBalanceUsd: input })
      const balance = getAccountBalanceSnapshots(account)
      if (expected === undefined) expect(balance.manual).toBeUndefined()
      else
        expect(balance.manual?.positions[0]?.amount).toMatchObject({
          status: "known",
          value: expected,
          source: { kind: "manual" },
        })
      expect(balance.reported.positions[0]?.amount.source.kind).toBe("legacy")
      expect(
        getAccountBalanceSnapshots({ ...account, manualBalanceUsd: "" }).manual,
      ).toBeUndefined()
      expect(parseDecimal(".5")).toBeUndefined()
    },
  )
  it("keeps identical field names in independent source collections distinct", () => {
    expect(
      balanceSnapshotSchema.safeParse({
        ...snapshot,
        positions: [
          position,
          {
            ...position,
            collectionKey: "inference",
            amount: {
              ...position.amount,
              source: { ...source, operation: "/inference/balance" },
            },
          },
        ],
      }).success,
    ).toBe(true)
  })
  it("keeps enumeration coverage independent of readable amounts and accepts verified authority aliases", () => {
    expect(
      accountBalanceSnapshot(scope, [position], 100, "partial").coverage,
    ).toBe("partial")
    expect(accountBalanceSnapshot(scope, [], 100).coverage).toBe("unknown")
    expect(accountBalanceSnapshot(scope, [], 100, "complete").coverage).toBe(
      "complete",
    )
    expect(
      accountBalanceScope(
        {
          baseUrl: "https://api.moonshot.cn",
          auth: { authType: "access_token" },
        } as never,
        { authority: "https://platform.kimi.com" },
      ).authority,
    ).toBe("https://platform.kimi.com")
  })
  it("fails closed instead of returning an undefined arithmetic result beyond the supported bound", () => {
    const maximum = "9".repeat(256)
    expect(parseDecimal(maximum)).toBe(maximum)
    expect(() => addDecimal(maximum, "1")).toThrow("decimal_overflow")
    expect(() => scaleDecimal(maximum, 1)).toThrow("decimal_overflow")
    expect(subtractDecimal(maximum, maximum)).toBe("0")
  })
  it("reads unversioned quota only as legacy and rejects unknown snapshot versions", () => {
    const legacy = readAccountBalance({ quota: 7658300 }, scope, 10)
    expect(legacy.positions[0]).toMatchObject({
      asset: { kind: "currency", code: "USD" },
      nature: "unknown",
      amount: {
        status: "stale",
        value: "15.3166",
        observedAt: 10,
        source: { kind: "legacy" },
      },
    })
    expect(() =>
      readAccountBalance(
        { balance: { schemaVersion: 999 }, quota: 1 },
        scope,
        10,
      ),
    ).toThrow()
  })
  it("preserves exact source amounts, signed ledger and sub-cent precision", () => {
    // S2/S3 source fixtures: USD microdollars arrive as exact strings, never an unsafe JSON number.
    expect(scaleDecimal("9007199254740993", -6)).toBe("9007199254.740993")
    expect(subtractDecimal("100", "30")).toBe("70")
    expect(subtractDecimal("70", "10")).toBe("60")
    expect(subtractDecimal("0", "5")).toBe("-5")
    expect(addDecimal("0.1", "0.2")).toBe("0.3")
    expect(parseDecimal("1e-20")).toBe("0.00000000000000000001")
    for (const input of [
      NaN,
      Infinity,
      9007199254740992,
      "1e999999",
      "",
      "0x12",
    ])
      expect(parseDecimal(input)).toBeUndefined()
    expect(
      balanceSnapshotSchema.parse(snapshot).positions[0]?.amount,
    ).toMatchObject({ status: "known", value: "70", source })
  })

  it("rejects ambiguous relationships, mismatched subjects and inverted windows before storage", () => {
    for (const patch of [
      { parentId: "balance", relation: BALANCE_RELATIONS.Component },
      { relation: BALANCE_RELATIONS.Component },
      { role: BALANCE_ROLES.CreditLimit, nature: BALANCE_NATURES.Prepaid },
      { window: { start: 20, end: 10, timeZone: "UTC" } },
      {
        scope: {
          ...scope,
          subject: {
            kind: FINANCIAL_SUBJECT_KINDS.Account,
            accountId: "another",
          },
        },
      },
    ]) {
      expect(
        balanceSnapshotSchema.safeParse({
          ...snapshot,
          positions: [{ ...position, ...patch }],
        }).success,
      ).toBe(false)
    }
  })
})
