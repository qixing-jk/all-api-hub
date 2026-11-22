import { describe, expect, it } from "vitest"

import { createUsageAnalyticsPreview } from "~/features/UsageAnalytics/data/createUsageAnalyticsPreview"

describe("usage report previews", () => {
  it("supplies a complete USD sample with separate model and token buckets", () => {
    const { accounts, store } = createUsageAnalyticsPreview("standard")
    expect(accounts).toHaveLength(1)
    const report = store.accounts[accounts[0]!.id]!
    expect(Object.values(report.daily)).toHaveLength(14)
    for (const bucket of Object.values(report.daily)) {
      expect(bucket).toMatchObject({
        requests: 1,
        consumption: [
          { asset: { kind: "currency", code: "USD" }, amount: { value: "6" } },
        ],
      })
      expect(bucket.consumptionIncomplete).toBeUndefined()
    }
    expect(Object.keys(report.dailyByModel)).toHaveLength(3)
    expect(Object.values(report.tokenNamesById).sort()).toEqual([
      "Playground",
      "Production",
    ])
  })

  it("retains missing charges and keeps recorded units independent", () => {
    const { accounts, store } = createUsageAnalyticsPreview("mixed")
    expect(accounts).toHaveLength(4)
    const reports = accounts.map(({ id }) => store.accounts[id]!)
    const assets = reports.map(({ daily }) =>
      Object.values(daily).flatMap(({ consumption }) =>
        (consumption ?? []).map(({ asset }) => asset),
      ),
    )
    expect(assets[0]).toEqual(Array(14).fill({ kind: "currency", code: "CNY" }))
    expect(assets[1]).toEqual(Array(14).fill({ kind: "currency", code: "USD" }))
    expect(assets[2]).toHaveLength(14)
    expect(assets[2]!.every(({ kind }) => kind === "quota")).toBe(true)
    expect(assets[3]).toHaveLength(7)
    expect(
      Object.values(reports[3]!.daily).filter(
        (day) => day.consumptionIncomplete,
      ),
    ).toHaveLength(7)
  })

  it("can preview an account without inventing recorded history", () => {
    const { accounts, store } = createUsageAnalyticsPreview("empty")
    expect(accounts).toHaveLength(1)
    expect(store.accounts).toEqual({})
  })
})
