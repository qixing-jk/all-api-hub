import { describe, expect, it } from "vitest"

import { ACCOUNT_SITE_TYPE_VALUES, SITE_TYPES } from "~/constants/siteType"
import { DEV_SITE_FINANCIAL_STATES } from "~/features/DevPanel/fixtureScenarioKinds"
import { buildDevSiteFinancialScenarios } from "~/features/DevPanel/fixtureSiteBalances"
import { accountAllowanceSnapshotSchema } from "~/services/accounts/allowances"
import { balanceSnapshotSchema } from "~/services/amounts/balance"

const NOW = Date.UTC(2026, 10, 17, 12)

describe("native site balance examples", () => {
  const scenarios = buildDevSiteFinancialScenarios(NOW)
  const find = (type: string) => scenarios.find((s) => s.siteType === type)!

  it("covers exactly the registered account types", () => {
    expect(scenarios.map((s) => s.siteType).sort()).toEqual(
      [...ACCOUNT_SITE_TYPE_VALUES].sort(),
    )
  })

  it.each(["default", "zero", "missing", "stale", "requests"] as const)(
    "produces persistable %s native scenarios",
    (state) => {
      for (const scenario of buildDevSiteFinancialScenarios(NOW, state)) {
        expect(
          balanceSnapshotSchema.safeParse(scenario.balance).success,
          scenario.siteType,
        ).toBe(true)
        if (scenario.allowances)
          expect(
            accountAllowanceSnapshotSchema.safeParse(scenario.allowances),
            scenario.siteType,
          ).toMatchObject({ success: true })
      }
    },
  )

  it.each([
    DEV_SITE_FINANCIAL_STATES.Zero,
    DEV_SITE_FINANCIAL_STATES.Missing,
    DEV_SITE_FINANCIAL_STATES.Stale,
  ] as const)("can preview %s observations for every native type", (state) => {
    const examples = buildDevSiteFinancialScenarios(NOW, state)
    expect(examples).toHaveLength(ACCOUNT_SITE_TYPE_VALUES.length)
    for (const example of examples) {
      expect(example.label).toBe(`${example.siteType} · ${state}`)
      for (const position of example.balance.positions) {
        expect(position.amount, example.siteType).toMatchObject(
          state === "zero"
            ? { status: "known", value: "0" }
            : state === "missing"
              ? { status: "unavailable" }
              : { status: "stale" },
        )
      }
      for (const entry of example.allowances?.entries ?? []) {
        expect(entry.constraint.remaining, example.siteType).toMatchObject(
          state === "zero"
            ? { status: "known", value: "0" }
            : state === "missing"
              ? { status: "unavailable" }
              : { status: "stale" },
        )
      }
    }
  })

  it("uses FoxCode's native daily, weekly, monthly and non-resetting plans", () => {
    // Native resetType: DAILY/WEEKLY/MONTHLY/YEARLY/NEVER.
    const entries = find(SITE_TYPES.FOXCODE).allowances!.entries
    expect(entries.map((entry) => entry.constraint.window)).toEqual([
      { kind: "periodic", period: "day" },
      { kind: "periodic", period: "week" },
      { kind: "periodic", period: "month" },
      { kind: "periodic", period: "year" },
      { kind: "lifetime" },
    ])
    expect(find(SITE_TYPES.FOXCODE).balance.positions).toEqual([])
  })

  it("keeps SharedChat amount and request subscriptions as distinct units", () => {
    const amount = find(SITE_TYPES.SHAREDCHAT).allowances!.entries
    const count = buildDevSiteFinancialScenarios(
      NOW,
      DEV_SITE_FINANCIAL_STATES.Requests,
    )[0]!.allowances!.entries
    expect(amount).toHaveLength(1)
    expect(count).toHaveLength(1)
    const entries = [...amount, ...count]
    expect(entries.map((entry) => entry.constraint.asset.kind)).toEqual([
      "currency",
      "quota",
    ])
    expect(entries[0]!.constraint.asset).toEqual({
      kind: "currency",
      code: "USD",
    })
    expect(entries[1]!.constraint.asset).toMatchObject({
      label: "requests",
      displayLabel: "requests",
    })
  })

  it("shows Krill's daily plan independently of the dollar wallet", () => {
    const scenario = find(SITE_TYPES.KRILL)
    expect(scenario.balance.positions[0]!.amount).toMatchObject({
      value: "12.34",
    })
    expect(scenario.allowances!.entries[0]!.constraint).toMatchObject({
      asset: { kind: "currency", code: "USD" },
      window: { kind: "periodic", period: "day" },
    })
  })

  it("previews Dahl's pool and key allocation under one total", () => {
    expect(find(SITE_TYPES.DAHL).balance.positions).toMatchObject([
      { id: "total", amount: { value: "2500000" } },
      {
        id: "pool",
        parentId: "total",
        relation: "component",
        amount: { value: "1500000" },
      },
      {
        id: "keys",
        parentId: "total",
        relation: "allocation",
        amount: { value: "1000000" },
      },
    ])
  })

  it("keeps RightCode dollar plan allowance separate from its dollar wallet", () => {
    const scenario = find(SITE_TYPES.RIGHT_CODE)
    expect(scenario.balance.positions[0]!.asset).toEqual({
      kind: "currency",
      code: "USD",
    })
    expect(scenario.allowances!.entries[0]!.constraint.asset).toMatchObject({
      kind: "currency",
      code: "USD",
    })
  })

  it("previews NanoGPT image and token limits as independent assets", () => {
    expect(
      find(SITE_TYPES.NANOGPT).allowances!.entries.map(
        (e) => e.constraint.asset,
      ),
    ).toMatchObject([
      { id: "nanogpt:input-token" },
      { id: "nanogpt:input-token" },
      { id: "nanogpt:image", displayLabel: "Image" },
    ])
  })

  it("previews Novita pending charges and debt without reconstructing available credit", () => {
    expect(find(SITE_TYPES.NOVITA).balance.positions).toMatchObject([
      { id: "available", amount: { value: "12.3" } },
      { id: "cash", role: "ledger", amount: { value: "-2" } },
      { id: "credit-limit", role: "credit-limit", amount: { value: "20" } },
      { id: "pending", role: "pending-charge", amount: { value: "3.7" } },
      { id: "debt", role: "debt", amount: { value: "2" } },
    ])
  })
})
