import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

import { parseKimiPricingDoc } from "~/services/kimiOpenPlatform/pricingDoc"

/**
 * Verbatim `/docs/pricing.md` snapshots. The two deployments render the same
 * table differently — the English page wraps numeric cells in JSX, the Chinese
 * page writes plain strings — so both shapes are pinned here.
 */
const readPricingDoc = (name: string) =>
  fs.readFileSync(
    path.resolve(process.cwd(), "tests/fixtures/kimi", name),
    "utf8",
  )

const byId = (entries: ReturnType<typeof parseKimiPricingDoc>, id: string) =>
  entries.find((entry) => entry.modelId === id)

describe("parseKimiPricingDoc", () => {
  it("reads the English table, including JSX-wrapped numeric cells", () => {
    const entries = parseKimiPricingDoc(readPricingDoc("pricing-doc.usd.md"))

    expect(entries.map((entry) => entry.modelId)).toEqual([
      "kimi-k3",
      "kimi-k2.7-code",
      "kimi-k2.7-code-highspeed",
      "kimi-k2.6",
    ])
    expect(byId(entries, "kimi-k3")).toEqual({
      modelId: "kimi-k3",
      currency: "USD",
      inputPrice: 3,
      outputPrice: 15,
      cacheReadPrice: 0.3,
      cacheWritePrice: 3,
      cacheWrite1hPrice: 6,
      contextLength: 1048576,
    })
    expect(byId(entries, "kimi-k2.6")).toEqual({
      modelId: "kimi-k2.6",
      currency: "USD",
      inputPrice: 0.95,
      outputPrice: 4,
      cacheReadPrice: 0.16,
      contextLength: 262144,
    })
  })

  it("reads the Chinese table, whose cells are plain strings and titled in Chinese", () => {
    const entries = parseKimiPricingDoc(readPricingDoc("pricing-doc.cny.md"))

    expect(entries.map((entry) => entry.modelId)).toEqual([
      "kimi-k3",
      "kimi-k2.7-code",
      "kimi-k2.7-code-highspeed",
      "kimi-k2.6",
    ])
    expect(byId(entries, "kimi-k3")).toEqual({
      modelId: "kimi-k3",
      currency: "CNY",
      inputPrice: 20,
      outputPrice: 100,
      cacheReadPrice: 2,
      cacheWritePrice: 20,
      cacheWrite1hPrice: 40,
      contextLength: 1048576,
    })
    expect(byId(entries, "kimi-k2.7-code-highspeed")).toMatchObject({
      inputPrice: 13,
      outputPrice: 54,
      cacheReadPrice: 2.6,
      contextLength: 262144,
    })
  })

  it("does not price a table whose columns cannot be identified", () => {
    const markdown = [
      "<DocTable",
      '  columns={[{ title: "Name" }, { title: "Cost" }]}',
      '  rows={[["kimi-k3", "3.00"]]}',
      "/>",
    ].join("\n")

    expect(parseKimiPricingDoc(markdown)).toEqual([])
  })

  it("skips rows that name no model or carry no readable price", () => {
    const markdown = [
      "<DocTable",
      '  columns={[{ title: "Model" }, { title: "Unit" }, { title: "Input Price" }, { title: "Output Price" }]}',
      '  rows={[["", "1M tokens", <>{"$"}1.00</>, <>{"$"}2.00</>], ["kimi-k3", "1M tokens", <>{"$"}n/a</>, <>{"$"}2.00</>], ["kimi-k2.6", "1M tokens", <>{"$"}0.95</>, <>{"$"}4.00</>]]}',
      "/>",
    ].join("\n")

    expect(parseKimiPricingDoc(markdown).map((e) => e.modelId)).toEqual([
      "kimi-k2.6",
    ])
  })

  it("returns nothing when the document carries no price table", () => {
    expect(
      parseKimiPricingDoc("# Model Inference Pricing\n\nNo tables.\n"),
    ).toEqual([])
  })

  it.each([
    ['"$1.00", "$2.00"', '"$1.00", "¥2.00"'],
    ['"$1.00", "$2.00"', '"$-1.00", "$2.00"'],
    ['"$1.00", "$2.00"', '"$1.00", unknownExpression, "$2.00"'],
    ['"1M tokens"', '"1K tokens"'],
    ['"$1.00", "$2.00"', '"$1,2", "$2.00"'],
    ['"kimi-k3"', '"K3"'],
    ['"Input Price"', '"Input Price (different billing)"'],
  ])("rejects unsafe price or unit changes: %s -> %s", (from, to) => {
    const doc =
      '<DocTable columns={[{ title: "Model" }, { title: "Unit" }, { title: "Input Price" }, { title: "Output Price" }]} rows={[["kimi-k3", "1M tokens", "$1.00", "$2.00"]]} />'
    expect(parseKimiPricingDoc(doc.replace(from, to))).toEqual([])
  })

  it("reads both yuan glyphs as CNY in one entry", () => {
    const doc =
      '<DocTable columns={[{ title: "Model" }, { title: "Unit" }, { title: "Input Price" }, { title: "Output Price" }]} rows={[["kimi-k3", "1M tokens", "￥20.00", "¥100.00"]]} />'
    expect(parseKimiPricingDoc(doc)).toEqual([
      {
        modelId: "kimi-k3",
        currency: "CNY",
        inputPrice: 20,
        outputPrice: 100,
      },
    ])
  })

  it("does not choose a price from conflicting rows for the same model", () => {
    const doc =
      '<DocTable columns={[{ title: "Model" }, { title: "Unit" }, { title: "Input Price" }, { title: "Output Price" }]} rows={[["kimi-k3", "1M tokens", "$1.00", "$2.00"], ["kimi-k3", "1M tokens", "$10.00", "$20.00"]]} />'
    expect(parseKimiPricingDoc(doc)).toEqual([])
  })
})
