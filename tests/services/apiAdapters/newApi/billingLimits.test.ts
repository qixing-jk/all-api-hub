import { expect, it } from "vitest"

import { parseNewApiBillingExpression } from "~/services/apiAdapters/newApi/billingExpression"
import { PRICING_PURPOSES } from "~/services/modelPricing/pricingConstants"
import { quoteModelPrice } from "~/services/modelPricing/quoteModelPrice"

const base = 'tier("base", p * 1 + c * 2)'
const leaf = 'param("service_tier") == "batch"'

it.each([
  {
    name: "alternative expansion",
    expression: `(${Array.from({ length: 129 }, (_, i) => `p < ${i + 1}`).join(" || ")}) ? ${base} : ${base}`,
  },
  {
    name: "conjunction expansion",
    expression: `(${Array.from({ length: 33 }, (_, i) => `p < ${i + 1}`).join(" && ")}) ? ${base} : ${base}`,
  },
  {
    name: "branch count",
    expression:
      Array.from({ length: 64 }, (_, i) => `len < ${i + 1} ? ${base} : `).join(
        "",
      ) + base,
  },
  {
    name: "request factor count",
    expression: `(${base})` + ` * (${leaf} ? 0.5 : 1)`.repeat(7),
  },
  {
    name: "condition cartesian product",
    expression: `(${Array.from({ length: 8 }, (_, i) => `(p < ${i + 1} || c < ${i + 1})`).join(" && ")}) ? ${base} : ${base}`,
  },
  {
    name: "negated alternative expansion",
    expression: `(${Array.from({ length: 8 }, (_, i) => `(hour("Etc/GMT+${i}") < 1 && minute("Etc/GMT+${i}") < 1)`).join(" || ")}) ? ${base} : ${base}`,
  },
])(
  "rejects excessive $name without using a partial schedule",
  ({ expression }) => {
    const plan = parseNewApiBillingExpression(expression)
    const quote = quoteModelPrice(
      plan,
      {
        purpose: PRICING_PURPOSES.TOKEN_INDEX,
        usage: { input: 1, output: 1 },
        inputTokens: 100,
      },
      { groupMultiplier: 1 },
    )
    expect(quote.status).toBe("unavailable")
    expect(quote.amount).toBeNull()
    expect(plan.rules).toEqual([])
  },
)
