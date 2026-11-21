import { describe, expect, it } from "vitest"

import {
  DATA_TYPE_BALANCE,
  DATA_TYPE_CHECK_IN_REQUIREMENT,
  DATA_TYPE_CONSUMPTION,
  DATA_TYPE_CREATED_AT,
  DATA_TYPE_HEALTH_STATUS,
  DATA_TYPE_INCOME,
  DATA_TYPE_NAME,
} from "~/constants"
import { ACCOUNT_USAGE_SCOPES } from "~/constants/accountUsage"
import { CURRENCIES } from "~/constants/money"
import { accountAllowanceObservation } from "~/services/accounts/allowances"
import {
  accountBalanceScope,
  accountBalanceSnapshot,
} from "~/services/accounts/balanceSnapshot"
import { staleBalancePosition } from "~/services/accounts/refresh/balanceAcceptance"
import { balancePosition, type Amount } from "~/services/amounts/balance"
import { budgetConstraint } from "~/services/amounts/budgets"
import {
  ASSET_KINDS,
  BALANCE_VALIDITY_KINDS,
  BUDGET_LIMIT_STATES,
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
  FINANCIAL_ENUMERATION,
  FINANCIAL_OBSERVATION_REASONS,
  FINANCIAL_SUBJECT_KINDS,
  INCOME_CLASSIFICATIONS,
  SCOPE_SELECTION_KINDS,
} from "~/services/amounts/financialConstants"
import {
  ACCOUNT_CONTEXT_BOOSTS,
  ACCOUNT_SORT_GROUPS,
  createAccountContextBoostResolver,
  createDynamicSortComparator,
  DEFAULT_SORTING_PRIORITY_CONFIG,
  getAccountSortGroup,
  OPEN_TAB_MATCH_TIER,
} from "~/services/preferences/utils/sortingPriority"
import { SiteHealthStatus, type SortOrder } from "~/types"
import {
  SortingCriteriaType,
  type SortingPriorityConfig,
} from "~/types/sorting"
import { buildFinancialPeriodFact } from "~~/tests/test-utils/accountTodayStats"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"
import {
  buildDisplaySiteData,
  buildSiteAccount,
} from "~~/tests/test-utils/factories"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

function config(
  criteria: SortingPriorityConfig["criteria"] = [],
): SortingPriorityConfig {
  return { criteria, lastModified: 1 }
}

/** Explicit account facts for tests whose contract is numeric balance ordering. */
function balanceSite(
  id: string,
  value: string,
  asset: Amount["asset"] = { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
) {
  const scope = {
    subject: { kind: FINANCIAL_SUBJECT_KINDS.Account, accountId: id } as const,
    authority: "https://sort.example",
    models: { kind: SCOPE_SELECTION_KINDS.All } as const,
    groups: { kind: SCOPE_SELECTION_KINDS.All } as const,
    keys: { kind: SCOPE_SELECTION_KINDS.All } as const,
    projects: { kind: SCOPE_SELECTION_KINDS.All } as const,
  }
  return buildDisplaySiteData({
    id,
    name: id,
    balance: { USD: 999, CNY: 999 },
    balanceSnapshot: accountBalanceSnapshot(
      scope,
      [
        balancePosition({
          id: "balance",
          scope,
          value,
          asset,
          observedAt: 100,
          source: {
            adapter: "fixture",
            operation: "balance",
            contractVersion: "1",
            kind: EVIDENCE_KINDS.Reported,
          },
        }),
      ],
      100,
      FINANCIAL_COVERAGE.Complete,
    ),
  })
}

describe("createDynamicSortComparator", () => {
  it.each(["asc", "desc"] as const)(
    "orders accepted decimal boundary balances across currencies without intermediate overflow in %s order",
    (order) => {
      const large = balanceSite("large", "9".repeat(256))
      const tiny = balanceSite("tiny", `0.${"0".repeat(252)}1`)
      const yuan = {
        ...balanceSite("yuan", "1", {
          kind: ASSET_KINDS.Currency,
          code: CURRENCIES.CNY,
        }),
        exchangeRate: 10,
      }
      const zero = balanceSite("zero", "0")
      const comparator = createDynamicSortComparator(
        config(),
        null,
        DATA_TYPE_BALANCE,
        CURRENCIES.USD,
        order,
      )
      expect(
        [large, yuan, tiny, zero].sort(comparator).map(({ id }) => id),
      ).toEqual(
        order === "asc"
          ? ["zero", "tiny", "yuan", "large"]
          : ["large", "yuan", "tiny", "zero"],
      )
    },
  )
  it.each([DATA_TYPE_CONSUMPTION, DATA_TYPE_INCOME] as const)(
    "sorts a mixed-currency %s total without rounding a yuan quotient",
    (metric) => {
      const mixed = buildDisplaySiteData({
        id: "mixed",
        name: "mixed",
        exchangeRate: 3,
        settledConsumption: [
          buildFinancialPeriodFact({ accountId: "mixed", value: "1" }),
          buildFinancialPeriodFact({
            accountId: "mixed",
            value: "1",
            asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
          }),
        ],
      })
      const dollars = buildDisplaySiteData({
        id: "dollars",
        name: "dollars",
        exchangeRate: 3,
        settledConsumption: [
          buildFinancialPeriodFact({
            accountId: "dollars",
            value: "1.33333333333333333332",
          }),
        ],
      })
      for (const site of [mixed, dollars])
        site.reportedIncome = site.settledConsumption?.map(
          ({ settlement: _settlement, ...fact }) => ({
            ...fact,
            classification: INCOME_CLASSIFICATIONS.Unclassified,
          }),
        )
      expect(
        [dollars, mixed]
          .sort(
            createDynamicSortComparator(config(), null, metric, "USD", "desc"),
          )
          .map(({ id }) => id),
      ).toEqual(["mixed", "dollars"])
    },
  )
  it("keeps original-mode sorting stable after a different display currency was selected", () => {
    const sites = [
      { ...balanceSite("dollars", "2"), exchangeRate: 8 },
      {
        ...balanceSite("yuan", "15", {
          kind: ASSET_KINDS.Currency,
          code: CURRENCIES.CNY,
        }),
        exchangeRate: 7,
      },
    ]
    for (const remembered of [CURRENCIES.USD, CURRENCIES.CNY] as const)
      expect(
        [...sites]
          .sort(
            createDynamicSortComparator(
              config(),
              null,
              DATA_TYPE_BALANCE,
              remembered,
              "desc",
              {},
              [],
              {},
              "original",
            ),
          )
          .map(({ id }) => id),
      ).toEqual(["yuan", "dollars"])
  })
  it("sorts the original primary cashflow rather than a secondary asset selected by the reference currency", () => {
    const sites = [
      { id: "a", usd: "9", cny: "1" },
      { id: "b", usd: "1", cny: "2" },
    ].map(({ id, usd, cny }) =>
      buildDisplaySiteData({
        id,
        name: id,
        settledConsumption: [
          buildFinancialPeriodFact({ accountId: id, value: usd }),
          buildFinancialPeriodFact({
            accountId: id,
            value: cny,
            asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
          }),
        ],
      }),
    )
    expect(
      sites
        .sort(
          createDynamicSortComparator(
            config(),
            null,
            DATA_TYPE_CONSUMPTION,
            "CNY",
            "desc",
            {},
            [],
            {},
            "original",
          ),
        )
        .map(({ id }) => id),
    ).toEqual(["a", "b"])
  })
  it("compares yuan at its own rate without rounding an inverse rate", () => {
    const yuan = balanceSite("yuan", "7.000000000000000000000000000001", {
      kind: ASSET_KINDS.Currency,
      code: CURRENCIES.CNY,
    })
    yuan.exchangeRate = 7
    const dollar = balanceSite("dollar", "1")
    expect(
      [dollar, yuan]
        .sort(
          createDynamicSortComparator(
            config(),
            null,
            DATA_TYPE_BALANCE,
            "USD",
            "desc",
          ),
        )
        .map(({ id }) => id),
    ).toEqual(["yuan", "dollar"])
    yuan.exchangeRate = 8
    expect(
      [yuan, dollar]
        .sort(
          createDynamicSortComparator(
            config(),
            null,
            DATA_TYPE_BALANCE,
            "USD",
            "desc",
          ),
        )
        .map(({ id }) => id),
    ).toEqual(["dollar", "yuan"])
  })
  it.each([DATA_TYPE_CONSUMPTION, DATA_TYPE_INCOME] as const)(
    "compares mixed yuan and dollar %s in one monetary group",
    (field) => {
      const sites = [
        { id: "yuan-eight", value: "8", currency: CURRENCIES.CNY },
        { id: "yuan-zero", value: "0", currency: CURRENCIES.CNY },
        { id: "dollars", value: "42.75", currency: CURRENCIES.USD },
      ].map(({ id, value, currency }) => {
        const fact = buildFinancialPeriodFact({
          accountId: id,
          value,
          asset: { kind: ASSET_KINDS.Currency, code: currency },
        })
        const { settlement: _settlement, ...income } = fact
        return buildDisplaySiteData({
          id,
          name: id,
          exchangeRate: 7,
          settledConsumption: [fact],
          reportedIncome: [
            { ...income, classification: INCOME_CLASSIFICATIONS.Grant },
          ],
        })
      })
      for (const currency of [CURRENCIES.USD, CURRENCIES.CNY] as const) {
        expect(
          [...sites]
            .sort(
              createDynamicSortComparator(
                config(),
                null,
                field,
                currency,
                "desc",
              ),
            )
            .map(({ id }) => id),
        ).toEqual(["dollars", "yuan-eight", "yuan-zero"])
        expect(
          [...sites]
            .sort(
              createDynamicSortComparator(
                config(),
                null,
                field,
                currency,
                "asc",
              ),
            )
            .map(({ id }) => id),
        ).toEqual(["yuan-zero", "yuan-eight", "dollars"])
      }
    },
  )
  it.each([CURRENCIES.USD, CURRENCIES.CNY] as const)(
    "orders mixed yuan and dollar balances by converted value in the %s view",
    (currency) => {
      const yuan = { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY } as const
      const sites = [
        balanceSite("yuan-eight", "8", yuan),
        balanceSite("yuan-zero", "0", yuan),
        balanceSite("dollars", "42.75"),
      ].map((site) => ({ ...site, exchangeRate: 7 }))
      expect(
        [...sites]
          .sort(
            createDynamicSortComparator(
              config(),
              null,
              DATA_TYPE_BALANCE,
              currency,
              "desc",
            ),
          )
          .map(({ id }) => id),
      ).toEqual(["dollars", "yuan-eight", "yuan-zero"])
      expect(
        [...sites]
          .sort(
            createDynamicSortComparator(
              config(),
              null,
              DATA_TYPE_BALANCE,
              currency,
              "asc",
            ),
          )
          .map(({ id }) => id),
      ).toEqual(["yuan-zero", "yuan-eight", "dollars"])
    },
  )
  it("orders the primary displayed balance without adding independent positions", () => {
    const first = balanceSite("a-main", "1")
    const second = balanceSite("b-main", "2")
    const primary = first.balanceSnapshot!.positions[0]!
    first.balanceSnapshot!.positions.push({
      ...structuredClone(primary),
      id: "independent",
      amount: balanceSite("a-main", "100").balanceSnapshot!.positions[0]!
        .amount,
    })
    expect(
      [second, first]
        .sort(
          createDynamicSortComparator(
            config(),
            null,
            DATA_TYPE_BALANCE,
            "USD",
            "asc",
          ),
        )
        .map(({ id }) => id),
    ).toEqual(["a-main", "b-main"])
  })
  it("uses the displayed manual balance ahead of the reported balance", () => {
    const manual = balanceSite("a-manual", "1")
    manual.manualBalanceSnapshot = balanceSite("a-manual", "10").balanceSnapshot
    const other = balanceSite("b-reported", "2")
    expect(
      [other, manual]
        .sort(
          createDynamicSortComparator(
            config(),
            null,
            DATA_TYPE_BALANCE,
            "USD",
            "desc",
          ),
        )
        .map(({ id }) => id),
    ).toEqual(["a-manual", "b-reported"])
  })
  it.each(["asc", "desc"] as const)(
    "sorts the displayed provider-day consumption after local-day consumption in %s order",
    (order) => {
      const providerDay = (id: string, value: string) => {
        const fact = buildFinancialPeriodFact({ accountId: id, value })
        return buildDisplaySiteData({
          id,
          name: id,
          usage: {
            scope: ACCOUNT_USAGE_SCOPES.SiteToday,
            reportedDay: "provider billing day",
            observedAt: Date.now(),
            cost: {
              asset: fact.asset,
              amount: fact.amount,
              scope: fact.scope,
              window: fact.window,
              coverage: fact.coverage,
            },
          },
        })
      }
      const localFact = buildFinancialPeriodFact({
        accountId: "local",
        value: "5",
      })
      const sites = [
        providerDay("a-high", "9"),
        providerDay("z-low", "1"),
        buildDisplaySiteData({ id: "local", settledConsumption: [localFact] }),
        buildDisplaySiteData({ id: "missing", name: "0" }),
      ]
      expect(
        sites
          .sort(
            createDynamicSortComparator(
              config(),
              null,
              DATA_TYPE_CONSUMPTION,
              "USD",
              order,
            ),
          )
          .map(({ id }) => id),
      ).toEqual(
        order === "asc"
          ? ["local", "z-low", "a-high", "missing"]
          : ["local", "a-high", "z-low", "missing"],
      )
    },
  )
  it.each([DATA_TYPE_CONSUMPTION, DATA_TYPE_INCOME] as const)(
    "sorts displayed last-known %s references numerically after current readings",
    (metric) => {
      const reference = (USD: number, lastKnown: boolean) => ({
        amount: { USD, CNY: USD * 7 },
        observedAt: Date.now(),
        lastKnown,
      })
      const sites = [
        buildDisplaySiteData({
          id: "old-high",
          name: "Alpha",
          referenceConsumption: reference(9, true),
          referenceIncome: reference(9, true),
        }),
        buildDisplaySiteData({
          id: "old-low",
          name: "Zulu",
          referenceConsumption: reference(1, true),
          referenceIncome: reference(1, true),
        }),
        buildDisplaySiteData({
          id: "current",
          referenceConsumption: reference(100, false),
          referenceIncome: reference(100, false),
        }),
        buildDisplaySiteData({ id: "missing", name: "0" }),
      ]
      for (const currency of [CURRENCIES.USD, CURRENCIES.CNY] as const) {
        for (const order of ["asc", "desc"] as const) {
          expect(
            [...sites]
              .sort(
                createDynamicSortComparator(
                  config(),
                  null,
                  metric,
                  currency,
                  order,
                ),
              )
              .map(({ id }) => id),
          ).toEqual(
            order === "asc"
              ? ["current", "old-low", "old-high", "missing"]
              : ["current", "old-high", "old-low", "missing"],
          )
        }
      }
    },
  )
  it.each([DATA_TYPE_CONSUMPTION, DATA_TYPE_INCOME] as const)(
    "sorts readable current-day release references for %s while leaving last-known values last",
    (metric) => {
      const reference = (USD: number, lastKnown = false) => ({
        amount: { USD, CNY: USD * 7 },
        observedAt: Date.now(),
        lastKnown,
      })
      const sites = [
        buildDisplaySiteData({
          id: "high",
          name: "Alpha",
          referenceConsumption: reference(9),
          referenceIncome: reference(9),
        }),
        buildDisplaySiteData({
          id: "low",
          name: "Zulu",
          referenceConsumption: reference(1),
          referenceIncome: reference(1),
        }),
        buildDisplaySiteData({
          id: "old",
          name: "Old",
          referenceConsumption: reference(100, true),
          referenceIncome: reference(100, true),
        }),
      ]
      for (const currency of [CURRENCIES.USD, CURRENCIES.CNY] as const) {
        expect(
          [...sites]
            .sort(
              createDynamicSortComparator(
                config(),
                null,
                metric,
                currency,
                "asc",
              ),
            )
            .map(({ id }) => id),
        ).toEqual(["low", "high", "old"])
        expect(
          [...sites]
            .sort(
              createDynamicSortComparator(
                config(),
                null,
                metric,
                currency,
                "desc",
              ),
            )
            .map(({ id }) => id),
        ).toEqual(["high", "low", "old"])
      }
    },
  )
  it.each([
    { order: "desc" as const, staleValue: "100", freshValue: "1" },
    { order: "asc" as const, staleValue: "1", freshValue: "100" },
  ])(
    "keeps a last-known balance in its displayed $order order",
    ({ order, staleValue, freshValue }) => {
      const stale = balanceSite("last-known", staleValue)
      const fresh = balanceSite("fresh", freshValue)
      stale.balanceSnapshot!.positions = stale.balanceSnapshot!.positions.map(
        (position) =>
          staleBalancePosition(
            position,
            FINANCIAL_OBSERVATION_REASONS.RefreshFailed,
          ),
      )
      const compare = createDynamicSortComparator(
        config(),
        null,
        DATA_TYPE_BALANCE,
        CURRENCIES.USD,
        order,
      )
      expect([fresh, stale].sort(compare).map(({ id }) => id)).toEqual([
        "last-known",
        "fresh",
      ])
    },
  )
  it("uses per-account exchange rates when sorting displayed yuan amounts", () => {
    const a = { ...balanceSite("a", "2"), exchangeRate: 5 }
    const b = { ...balanceSite("b", "1.5"), exchangeRate: 8 }
    const usd = createDynamicSortComparator(
      config(),
      null,
      DATA_TYPE_BALANCE,
      CURRENCIES.USD,
      "desc",
    )
    const cny = createDynamicSortComparator(
      config(),
      null,
      DATA_TYPE_BALANCE,
      CURRENCIES.CNY,
      "desc",
    )
    expect([a, b].sort(usd).map(({ id }) => id)).toEqual(["a", "b"])
    expect([a, b].sort(cny).map(({ id }) => id)).toEqual(["b", "a"])
  })
  it("sorts reported USD balances even when restrictions are unknown", () => {
    const accounts = [balanceSite("a-low", "1"), balanceSite("z-high", "10")]
    for (const account of accounts) {
      const scope = accountBalanceScope({
        baseUrl: account.baseUrl,
        accountId: account.id,
      })
      account.balanceSnapshot!.positions[0]!.scope = scope
    }
    const compare = createDynamicSortComparator(
      config(),
      null,
      DATA_TYPE_BALANCE,
      CURRENCIES.USD,
      "desc",
    )
    expect(accounts.sort(compare).map(({ id }) => id)).toEqual([
      "z-high",
      "a-low",
    ])
  })
  it.each(["asc", "desc"] as const)(
    "sorts displayed plan remaining amounts within their own group in %s order",
    (order) => {
      const plan = (id: string, remaining: string) => {
        const scope = accountBalanceScope({
          baseUrl: `https://${id}.example`,
          accountId: id,
        })
        const source = {
          adapter: "fixture",
          operation: "plans",
          contractVersion: "1",
          kind: EVIDENCE_KINDS.Reported,
        } as const
        return buildDisplaySiteData({
          id,
          name: id,
          allowances: accountAllowanceObservation(
            scope,
            [
              {
                source,
                collectionKey: "plans",
                enumeration: FINANCIAL_ENUMERATION.Complete,
                entries: [
                  {
                    id: "plan",
                    identityKind: "upstream",
                    collectionKey: "plans",
                    validity: { kind: BALANCE_VALIDITY_KINDS.NoExpiry },
                    constraint: budgetConstraint({
                      asset: {
                        kind: ASSET_KINDS.Currency,
                        code: CURRENCIES.USD,
                      },
                      scope,
                      source,
                      observedAt: Date.now(),
                      limitState: BUDGET_LIMIT_STATES.Finite,
                      remaining,
                    }),
                  },
                ],
              },
            ],
            Date.now(),
          ).allowances,
        })
      }
      const accounts = [
        plan("a-high", "100"),
        plan("z-low", "1"),
        balanceSite("cash", "5"),
        buildDisplaySiteData({ id: "missing", name: "0" }),
      ]
      expect(
        accounts
          .sort(
            createDynamicSortComparator(
              config(),
              null,
              DATA_TYPE_BALANCE,
              "USD",
              order,
            ),
          )
          .map(({ id }) => id),
      ).toEqual(
        order === "asc"
          ? ["cash", "z-low", "a-high", "missing"]
          : ["cash", "a-high", "z-low", "missing"],
      )
    },
  )
  it.each(["asc", "desc"] as const)(
    "sorts displayed restricted balances numerically in %s order",
    (order) => {
      const accounts = [balanceSite("a-high", "10"), balanceSite("z-low", "1")]
      for (const account of accounts) {
        account.balanceSnapshot!.positions[0]!.scope.models = {
          kind: SCOPE_SELECTION_KINDS.Restricted,
          ids: ["model-a"],
        }
      }
      const missing = buildDisplaySiteData({ id: "missing", name: "0" })
      expect(
        [missing, ...accounts]
          .sort(
            createDynamicSortComparator(
              config(),
              null,
              DATA_TYPE_BALANCE,
              "USD",
              order,
            ),
          )
          .map(({ id }) => id),
      ).toEqual(
        order === "asc"
          ? ["z-low", "a-high", "missing"]
          : ["a-high", "z-low", "missing"],
      )
    },
  )
  it.each([DATA_TYPE_CONSUMPTION, DATA_TYPE_INCOME] as const)(
    "sorts the converted monetary total when %s has multiple native currencies",
    (metric) => {
      const sites = [
        { id: "a", usd: "9", cny: "1" },
        { id: "b", usd: "1", cny: "2" },
      ].map(({ id, usd, cny }) => {
        const facts = [
          buildFinancialPeriodFact({ accountId: id, value: usd }),
          buildFinancialPeriodFact({
            accountId: id,
            value: cny,
            asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
          }),
        ]
        return buildDisplaySiteData({
          id,
          name: id,
          settledConsumption: facts,
          reportedIncome: facts.map(({ settlement: _settlement, ...fact }) => ({
            ...fact,
            classification: INCOME_CLASSIFICATIONS.Grant,
          })),
        })
      })
      expect(
        [...sites]
          .sort(
            createDynamicSortComparator(config(), null, metric, "USD", "asc"),
          )
          .map(({ id }) => id),
      ).toEqual(["b", "a"])
      expect(
        [...sites]
          .sort(
            createDynamicSortComparator(config(), null, metric, "CNY", "asc"),
          )
          .map(({ id }) => id),
      ).toEqual(["b", "a"])
    },
  )
  it.each([DATA_TYPE_CONSUMPTION, DATA_TYPE_INCOME] as const)(
    "sorts displayed current-day %s values across different observation starts",
    (metric) => {
      const sites = [
        { id: "a-high", value: "9", offset: 0 },
        { id: "z-low", value: "1", offset: 1 },
      ].map(({ id, value, offset }) => {
        const fact = buildFinancialPeriodFact({ accountId: id, value })
        fact.window.start += offset
        fact.window.end += offset + 1
        const { settlement: _settlement, ...income } = fact
        return buildDisplaySiteData({
          id,
          name: id,
          settledConsumption: [fact],
          reportedIncome: [
            { ...income, classification: INCOME_CLASSIFICATIONS.Grant },
          ],
        })
      })
      expect(
        [...sites]
          .sort(
            createDynamicSortComparator(config(), null, metric, "USD", "asc"),
          )
          .map(({ id }) => id),
      ).toEqual(["z-low", "a-high"])
      expect(
        [...sites]
          .sort(
            createDynamicSortComparator(config(), null, metric, "USD", "desc"),
          )
          .map(({ id }) => id),
      ).toEqual(["a-high", "z-low"])
    },
  )
  it.each([DATA_TYPE_CONSUMPTION, DATA_TYPE_INCOME] as const)(
    "sorts exact native %s amounts within displayed asset groups",
    (field) => {
      const site = (id: string, value: string) => {
        const fact = buildFinancialPeriodFact({
          accountId: id,
          value,
          asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
        })
        const { settlement: _settlement, ...income } = fact
        return buildDisplaySiteData({
          id,
          name: id,
          settledConsumption: [fact],
          reportedIncome: [
            { ...income, classification: INCOME_CLASSIFICATIONS.Grant },
          ],
        })
      }
      const smaller = site("z-smaller", "9007199254740992.000000000000001")
      smaller.excludeFromTodayIncome = true
      const larger = site("a-larger", "9007199254740992.000000000000002")
      const missing = buildDisplaySiteData({
        id: "missing",
        name: "0",
        todayConsumption: { USD: 0, CNY: 0 },
        todayIncome: { USD: 0, CNY: 0 },
      })
      const sorted = [missing, larger, smaller].sort(
        createDynamicSortComparator(
          config(),
          null,
          field,
          CURRENCIES.USD,
          "asc",
        ),
      )
      expect(sorted.map(({ id }) => id)).toEqual([
        "z-smaller",
        "a-larger",
        "missing",
      ])
    },
  )
  it.each<SortOrder>(["asc", "desc"])(
    "sorts exact native amounts within stable asset groups and keeps unknown last in %s order",
    (order) => {
      const unknown = buildDisplaySiteData({
        id: "unknown",
        name: "aaa",
        balance: { USD: 0, CNY: 0 },
        balanceUnavailable: true,
      })
      const tokenAsset = {
        kind: ASSET_KINDS.Quota,
        id: "issuer:tokens",
        label: "Token",
        displayScale: 1000000,
        displayLabel: "M Token",
      } as const
      const accounts = [
        unknown,
        balanceSite("token", "100000000", tokenAsset),
        balanceSite("z-low", "9007199254740992"),
        balanceSite("a-high", "9007199254740993"),
        balanceSite("zero", "0"),
        balanceSite("negative", "-2"),
      ]
      accounts.sort(
        createDynamicSortComparator(
          config(),
          null,
          DATA_TYPE_BALANCE,
          CURRENCIES.USD,
          order,
        ),
      )
      expect(accounts.map((account) => account.id)).toEqual(
        order === "asc"
          ? ["negative", "zero", "z-low", "a-high", "token", "unknown"]
          : ["a-high", "z-low", "zero", "negative", "token", "unknown"],
      )
    },
  )
  it.each<SortOrder>(["asc", "desc"])(
    "keeps native allowances after comparable balances in %s order",
    (order) => {
      const accounts = [
        buildDisplaySiteData({
          id: "native",
          balance: { USD: 5, CNY: 35 },
          nativeBalance: {
            unit: CURRENCIES.USD,
            total: 100,
            permanent: 5,
            daily: 95,
          },
        }),
        balanceSite("low", "1"),
        balanceSite("high", "10"),
      ]
      accounts.sort(
        createDynamicSortComparator(
          config(),
          null,
          DATA_TYPE_BALANCE,
          CURRENCIES.USD,
          order,
          {},
          [],
        ),
      )
      expect(accounts.map(({ id }) => id)).toEqual(
        order === "asc" ? ["low", "high", "native"] : ["high", "low", "native"],
      )
    },
  )

  it("groups pinned, normal, and disabled accounts when no context boost applies", () => {
    const accounts = [
      buildDisplaySiteData({
        id: "disabled-pinned",
        name: "A",
        disabled: true,
      }),
      buildDisplaySiteData({ id: "normal", name: "B" }),
      buildDisplaySiteData({ id: "pinned", name: "C" }),
    ]

    accounts.sort(
      createDynamicSortComparator(
        config(),
        null,
        DATA_TYPE_BALANCE,
        CURRENCIES.USD,
        "asc",
        {},
        ["pinned", "disabled-pinned"],
      ),
    )

    expect(accounts.map(({ id }) => id)).toEqual([
      "pinned",
      "normal",
      "disabled-pinned",
    ])
  })

  it("treats a disabled pinned account as disabled", () => {
    const pinnedIds = new Set(["account"])
    expect(
      getAccountSortGroup(
        buildDisplaySiteData({ id: "account", disabled: true }),
        pinnedIds,
      ),
    ).toBe(ACCOUNT_SORT_GROUPS.Disabled)
  })

  it("applies the active user sort only inside each fixed group", () => {
    const accounts = [
      balanceSite("normal-high", "9"),
      balanceSite("pinned-low", "1"),
      balanceSite("normal-low", "2"),
    ]

    accounts.sort(
      createDynamicSortComparator(
        DEFAULT_SORTING_PRIORITY_CONFIG,
        null,
        DATA_TYPE_BALANCE,
        CURRENCIES.USD,
        "asc",
        {},
        ["pinned-low"],
      ),
    )

    expect(accounts.map(({ id }) => id)).toEqual([
      "pinned-low",
      "normal-low",
      "normal-high",
    ])
  })

  it("lets an active user sort outrank removed link criteria and manual ordering", () => {
    const accounts = [
      buildDisplaySiteData({
        ...balanceSite("manual-first", "9"),
        checkIn: buildCheckInConfig({
          customCheckIn: { url: "https://example.com/checkin" },
        }),
      }),
      balanceSite("balance-first", "1"),
    ]

    accounts.sort(
      createDynamicSortComparator(
        config([
          {
            id: SortingCriteriaType.CUSTOM_CHECK_IN_URL,
            enabled: true,
            priority: 0,
          },
        ]),
        null,
        DATA_TYPE_BALANCE,
        CURRENCIES.USD,
        "asc",
        {},
        [],
        { "manual-first": 0, "balance-first": 1 },
      ),
    )

    expect(accounts.map(({ id }) => id)).toEqual([
      "balance-first",
      "manual-first",
    ])
  })

  it("ignores removed link priorities when user sorting is cleared", () => {
    const accounts = [
      buildDisplaySiteData({ id: "alpha", name: "Alpha" }),
      buildDisplaySiteData({
        id: "zulu-checkin",
        name: "Zulu",
        checkIn: buildCheckInConfig({
          customCheckIn: { url: "https://example.com/checkin" },
        }),
      }),
    ]

    accounts.sort(
      createDynamicSortComparator(
        config([
          {
            id: SortingCriteriaType.CUSTOM_CHECK_IN_URL,
            enabled: true,
            priority: 0,
          },
        ]),
        null,
        null,
        CURRENCIES.USD,
        "asc",
      ),
    )

    expect(accounts.map(({ id }) => id)).toEqual(["alpha", "zulu-checkin"])
  })

  it("keeps manual order when user sorting is cleared and a legacy link criterion is disabled", () => {
    const accounts = [
      buildDisplaySiteData({
        id: "healthy",
        health: { status: SiteHealthStatus.Healthy },
      }),
      buildDisplaySiteData({
        id: "error",
        health: { status: SiteHealthStatus.Error },
      }),
    ]

    accounts.sort(
      createDynamicSortComparator(
        config([
          {
            id: SortingCriteriaType.CUSTOM_CHECK_IN_URL,
            enabled: false,
            priority: 0,
          },
        ]),
        null,
        null,
        CURRENCIES.USD,
        "asc",
        {},
        [],
        { healthy: 0, error: 1 },
      ),
    )

    expect(accounts.map(({ id }) => id)).toEqual(["healthy", "error"])
  })

  it.each(["custom_check_in_url", "custom_redeem_url"] as const)(
    "sorts %s by link presence in either direction and uses manual order for ties",
    (field) => {
      const key = field === "custom_check_in_url" ? "url" : "redeemUrl"
      const accounts = [
        buildDisplaySiteData({ id: "absent", name: "A" }),
        buildDisplaySiteData({
          id: "blank",
          name: "B",
          checkIn: buildCheckInConfig({ customCheckIn: { [key]: "  " } }),
        }),
        buildDisplaySiteData({
          id: "linked",
          name: "Z",
          checkIn: buildCheckInConfig({
            customCheckIn: { [key]: "https://example.com" },
          }),
        }),
        buildDisplaySiteData({
          id: "linked-first",
          name: "Y",
          checkIn: buildCheckInConfig({
            customCheckIn: { [key]: "https://other.example.com" },
          }),
        }),
      ]
      const compare = (order: SortOrder) =>
        createDynamicSortComparator(
          config(),
          null,
          field,
          CURRENCIES.USD,
          order,
          {},
          [],
          { "linked-first": 0, linked: 1, absent: 2, blank: 3 },
        )
      expect([...accounts].sort(compare("desc")).map(({ id }) => id)).toEqual([
        "linked-first",
        "linked",
        "absent",
        "blank",
      ])
      expect([...accounts].sort(compare("asc")).map(({ id }) => id)).toEqual([
        "absent",
        "blank",
        "linked-first",
        "linked",
      ])
    },
  )

  it("supports health status as an active user sort", () => {
    const accounts = [
      buildDisplaySiteData({ id: "missing", health: undefined }),
      buildDisplaySiteData({
        id: "unknown",
        health: { status: SiteHealthStatus.Unknown },
      }),
      buildDisplaySiteData({
        id: "healthy",
        health: { status: SiteHealthStatus.Healthy },
      }),
      buildDisplaySiteData({
        id: "warning",
        health: { status: SiteHealthStatus.Warning },
      }),
      buildDisplaySiteData({
        id: "error",
        health: { status: SiteHealthStatus.Error },
      }),
    ]

    accounts.sort(
      createDynamicSortComparator(
        DEFAULT_SORTING_PRIORITY_CONFIG,
        null,
        DATA_TYPE_HEALTH_STATUS,
        CURRENCIES.USD,
        "asc",
      ),
    )

    expect(accounts.map(({ id }) => id)).toEqual([
      "error",
      "warning",
      "missing",
      "unknown",
      "healthy",
    ])
  })

  it("ignores removed legacy criteria from persisted settings", () => {
    const accounts = [
      buildDisplaySiteData({ id: "beta", name: "Beta" }),
      buildDisplaySiteData({ id: "alpha", name: "Alpha" }),
    ]

    accounts.sort(
      createDynamicSortComparator(
        config([
          {
            id: SortingCriteriaType.USER_SORT_FIELD,
            enabled: true,
            priority: 0,
          },
          {
            id: SortingCriteriaType.MANUAL_ORDER,
            enabled: true,
            priority: 1,
          },
        ]),
        null,
        null,
        CURRENCIES.USD,
        "desc",
      ),
    )

    expect(accounts.map(({ id }) => id)).toEqual(["alpha", "beta"])
  })

  it.each(["asc", "desc"] as const)(
    "supports check-in requirement as an active %s sort",
    (sortOrder) => {
      const accounts = [
        buildDisplaySiteData({
          id: "done",
          checkIn: buildCheckInConfig({
            customCheckIn: {
              url: "https://example.com/checkin",
              isCheckedInToday: true,
            },
          }),
        }),
        buildDisplaySiteData({
          id: "required",
          checkIn: buildCheckInConfig({
            customCheckIn: {
              url: "https://example.com/checkin",
              isCheckedInToday: false,
            },
          }),
        }),
      ]

      accounts.sort(
        createDynamicSortComparator(
          config(),
          null,
          DATA_TYPE_CHECK_IN_REQUIREMENT,
          CURRENCIES.USD,
          sortOrder,
        ),
      )

      expect(accounts.map(({ id }) => id)).toEqual(
        sortOrder === "asc" ? ["done", "required"] : ["required", "done"],
      )
    },
  )

  it("sorts created time and uses account name as the stable final fallback", () => {
    const accounts = [
      buildDisplaySiteData({ id: "beta", name: "Beta", created_at: 1 }),
      buildDisplaySiteData({ id: "alpha", name: "Alpha", created_at: 1 }),
      buildDisplaySiteData({ id: "newest", name: "Newest", created_at: 2 }),
    ]

    accounts.sort(
      createDynamicSortComparator(
        config(),
        null,
        DATA_TYPE_CREATED_AT,
        CURRENCIES.USD,
        "desc",
      ),
    )

    expect(accounts.map(({ id }) => id)).toEqual(["newest", "alpha", "beta"])
  })

  it("keeps name ordering stable for records without a display name", () => {
    const accounts = [
      buildDisplaySiteData({ id: "beta", name: undefined as never }),
      buildDisplaySiteData({ id: "alpha", name: undefined as never }),
    ]

    accounts.sort(
      createDynamicSortComparator(
        config(),
        null,
        DATA_TYPE_NAME,
        CURRENCIES.USD,
        "asc",
      ),
    )

    expect(accounts.map(({ id }) => id)).toEqual(["alpha", "beta"])
  })

  it("sorts today's consumption and income numerically", () => {
    const low = buildDisplaySiteData({
      id: "low",
      todayConsumption: { USD: 1, CNY: 1 },
      todayIncome: { USD: 1, CNY: 1 },
      settledConsumption: [
        buildFinancialPeriodFact({ accountId: "low", value: "1" }),
      ],
      reportedIncome: [
        {
          ...(({ settlement: _settlement, ...rest }) => rest)(
            buildFinancialPeriodFact({ accountId: "low", value: "1" }),
          ),
          classification: INCOME_CLASSIFICATIONS.Grant,
        },
      ],
    })
    const high = buildDisplaySiteData({
      id: "high",
      todayConsumption: { USD: 9, CNY: 9 },
      todayIncome: { USD: 9, CNY: 9 },
      settledConsumption: [
        buildFinancialPeriodFact({ accountId: "high", value: "9" }),
      ],
      reportedIncome: [
        {
          ...(({ settlement: _settlement, ...rest }) => rest)(
            buildFinancialPeriodFact({ accountId: "high", value: "9" }),
          ),
          classification: INCOME_CLASSIFICATIONS.Grant,
        },
      ],
    })

    expect(
      [high, low]
        .sort(
          createDynamicSortComparator(
            config(),
            null,
            DATA_TYPE_CONSUMPTION,
            "USD",
            "asc",
          ),
        )
        .map(({ id }) => id),
    ).toEqual(["low", "high"])
    expect(
      [low, high]
        .sort(
          createDynamicSortComparator(
            config(),
            null,
            DATA_TYPE_INCOME,
            "USD",
            "desc",
          ),
        )
        .map(({ id }) => id),
    ).toEqual(["high", "low"])
  })

  it("uses manual order before the name fallback", () => {
    const accounts = [
      buildDisplaySiteData({ id: "alpha", name: "Alpha" }),
      buildDisplaySiteData({ id: "beta", name: "Beta" }),
    ]

    accounts.sort(
      createDynamicSortComparator(
        config(),
        null,
        null,
        CURRENCIES.USD,
        "asc",
        {},
        [],
        {
          beta: 0,
          alpha: 1,
        },
      ),
    )

    expect(accounts.map(({ id }) => id)).toEqual(["beta", "alpha"])
  })
})

describe("browsing context priority", () => {
  it.each(["asc", "desc"] as const)(
    "promotes the active tab and other related pages above pinned accounts and sorts each tier by balance (%s)",
    (direction) => {
      const accounts = [
        balanceSite("normal", "100"),
        balanceSite("open-low", "1"),
        balanceSite("open-high", "9"),
        balanceSite("active", "5"),
        balanceSite("current", "5"),
        buildDisplaySiteData({ id: "pinned" }),
        balanceSite("open-pinned", "0"),
        buildDisplaySiteData({ id: "disabled", disabled: true }),
      ]
      const tiers = {
        "open-low": OPEN_TAB_MATCH_TIER.BACKGROUND,
        "open-pinned": OPEN_TAB_MATCH_TIER.BACKGROUND,
        "open-high": OPEN_TAB_MATCH_TIER.BACKGROUND,
        active: OPEN_TAB_MATCH_TIER.ACTIVE,
        current: OPEN_TAB_MATCH_TIER.ACTIVE,
        disabled: OPEN_TAB_MATCH_TIER.ACTIVE,
      }
      const comparator = createDynamicSortComparator(
        DEFAULT_SORTING_PRIORITY_CONFIG,
        buildSiteAccount({ id: "current" }),
        DATA_TYPE_BALANCE,
        CURRENCIES.USD,
        direction,
        tiers,
        ["pinned", "open-pinned", "disabled"],
      )
      expect(accounts.sort(comparator).map(({ id }) => id)).toEqual([
        "current",
        "active",
        "open-pinned",
        ...(direction === "asc"
          ? ["open-low", "open-high"]
          : ["open-high", "open-low"]),
        "pinned",
        "normal",
        "disabled",
      ])
      expect(comparator(atIndex(accounts, 1), atIndex(accounts, 1))).toBe(0)
    },
  )

  it("resolves the active tab tier above related pages open in other tabs", () => {
    const settings = config([
      { id: SortingCriteriaType.MATCHED_OPEN_TABS, enabled: true, priority: 0 },
    ])
    const resolve = createAccountContextBoostResolver(settings, undefined, {
      active: OPEN_TAB_MATCH_TIER.ACTIVE,
      background: OPEN_TAB_MATCH_TIER.BACKGROUND,
    })

    expect(resolve("active")).toBe(ACCOUNT_CONTEXT_BOOSTS.ActiveTab)
    expect(resolve("background")).toBe(ACCOUNT_CONTEXT_BOOSTS.OpenTabs)
    expect(resolve("unmatched")).toBeUndefined()
  })

  it("keeps the signed-in account and the field sort ahead of the active tab tier", () => {
    const accounts = [
      buildDisplaySiteData({ id: "active", name: "A" }),
      buildDisplaySiteData({ id: "current", name: "M" }),
      buildDisplaySiteData({ id: "other", name: "B" }),
    ]

    accounts.sort(
      createDynamicSortComparator(
        DEFAULT_SORTING_PRIORITY_CONFIG,
        buildSiteAccount({ id: "current" }),
        DATA_TYPE_NAME,
        CURRENCIES.USD,
        "asc",
        {
          active: OPEN_TAB_MATCH_TIER.ACTIVE,
          current: OPEN_TAB_MATCH_TIER.ACTIVE,
        },
      ),
    )

    expect(accounts.map(({ id }) => id)).toEqual(["current", "active", "other"])
  })

  it("preserves disabled choices and uses current-site priority regardless of legacy priority numbers", () => {
    const settings = config([
      { id: SortingCriteriaType.MATCHED_OPEN_TABS, enabled: true, priority: 0 },
      { id: SortingCriteriaType.CURRENT_SITE, enabled: true, priority: 9 },
    ])
    expect(
      createAccountContextBoostResolver(settings, "current", {
        current: OPEN_TAB_MATCH_TIER.BACKGROUND,
      })("current"),
    ).toBe(ACCOUNT_CONTEXT_BOOSTS.CurrentSite)
    atIndex(settings.criteria, 1).enabled = false
    expect(
      createAccountContextBoostResolver(settings, "current", {
        current: OPEN_TAB_MATCH_TIER.BACKGROUND,
      })("current"),
    ).toBe(ACCOUNT_CONTEXT_BOOSTS.OpenTabs)
    atIndex(settings.criteria, 0).enabled = false
    const resolve = createAccountContextBoostResolver(settings, "current", {
      current: OPEN_TAB_MATCH_TIER.BACKGROUND,
    })
    expect(resolve("current")).toBeUndefined()
    const accounts = [
      buildDisplaySiteData({ id: "current", name: "Z" }),
      buildDisplaySiteData({ id: "other", name: "A" }),
    ]
    expect(
      accounts
        .sort(
          createDynamicSortComparator(
            settings,
            buildSiteAccount({ id: "current" }),
            DATA_TYPE_NAME,
            "USD",
            "asc",
            { current: OPEN_TAB_MATCH_TIER.BACKGROUND },
          ),
        )
        .map(({ id }) => id),
    ).toEqual(["other", "current"])
  })
})
