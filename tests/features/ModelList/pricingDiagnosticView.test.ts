import { describe, expect, it } from "vitest"

import {
  groupPricingDiagnosticRows,
  matchesPricingDiagnosticSearch,
  PRICING_DIAGNOSTIC_GROUPINGS,
  type PricingDiagnosticRow,
} from "~/features/ModelList/pricingDiagnosticView"
import {
  PRICING_ISSUE_CODES,
  PRICING_METERS,
  QUOTE_STATUSES,
  QUOTE_UNITS,
} from "~/services/modelPricing/pricingConstants"

const row: PricingDiagnosticRow = {
  model: "Qwen/qwen3.5",
  source: { name: "Sample", origin: "https://api.example" },
  group: "premium",
  status: QUOTE_STATUSES.PARTIAL,
  unit: QUOTE_UNITS.REQUEST,
  issues: [
    { code: PRICING_ISSUE_CODES.PRICE_MISSING, meter: PRICING_METERS.INPUT },
  ],
  quote: undefined,
  plan: undefined,
  legacyPrice: undefined,
}

describe("diagnostic search and grouping", () => {
  it.each([
    ["", true],
    ["qwen premium price-missing:input", true],
    ["qwen default", false],
    ["https://user:SECRET@API.EXAMPLE:443/v1/models?key=PRIVATE#pricing", true],
    ["api.example/v1/models QWEN", true],
    ["https://api.example.evil/v1", false],
    ["http://api.example/v1", false],
    ["https://api.example:444/v1", false],
    ["https://", false],
    ["Qwen/qwen3.5", true],
  ])("matches %s as %s", (search, result) => {
    expect(matchesPricingDiagnosticSearch(row, search)).toBe(result)
  })

  it("preserves local URL ports and protocol-less host paths", () => {
    const local = {
      ...row,
      source: { name: "Local", origin: "http://localhost:8080" },
    }
    expect(matchesPricingDiagnosticSearch(local, "localhost:8080/v1")).toBe(
      true,
    )
    expect(
      matchesPricingDiagnosticSearch(local, "http://localhost:8081/v1"),
    ).toBe(false)
  })

  it("groups all records before pagination, keeping absent and literal group names distinct", () => {
    const rows = [
      ...Array.from({ length: 60 }, () => row),
      {
        ...row,
        source: { name: "Other", origin: undefined },
        group: undefined,
      },
      { ...row, group: "missing" },
    ]
    expect(
      groupPricingDiagnosticRows(rows, PRICING_DIAGNOSTIC_GROUPINGS.ORIGIN).map(
        (group) => group.rows.length,
      ),
    ).toEqual([61, 1])
    expect(
      groupPricingDiagnosticRows(rows, PRICING_DIAGNOSTIC_GROUPINGS.GROUP),
    ).toHaveLength(3)
    expect(
      groupPricingDiagnosticRows(rows, PRICING_DIAGNOSTIC_GROUPINGS.NONE)[0]
        .rows,
    ).toHaveLength(62)
  })
})
