import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"

import { connectWorktreeExtension } from "../../scripts/cdp/client.mjs"
import { loadLocalEnv } from "../../scripts/utils/local-env.mjs"

// Bounded design probe, never a production adapter or a second quote engine.
// Run with the existing current-worktree WXT dev browser:
// CDP_URL=http://127.0.0.1:9337 node .scratch/aimlapi-pricing/probe-grok-contracts.mjs
// Only public catalogue GETs; each candidate uses the real canonical quote API.
// Results describe the candidate mappings, not a proof about every possible design.
await loadLocalEnv()
const output = path.resolve(".output/chrome-mv3-dev")
const html = await fs.readFile(path.join(output, "options.html"), "utf8")
const origin = html.match(
  /src="(http:\/\/(?:127\.0\.0\.1|localhost):\d+)\/@vite\/client/,
)?.[1]
if (!origin) throw new Error("A current-worktree WXT dev output is required")
const evidence = path.resolve(
  ".scratch/aimlapi-pricing/artifacts",
  `grok-contract-probe-${randomUUID()}`,
)
await fs.mkdir(evidence, { recursive: true })
const fileName = `aah-contract-probe-${randomUUID()}.html`
const ownedFile = path.join(output, fileName)
const dev = await connectWorktreeExtension({ extensionPath: output })
let page
let created = false
try {
  await fs.writeFile(
    ownedFile,
    "<!doctype html><title>Bounded pricing contract probe</title>",
    { flag: "wx" },
  )
  created = true
  page = await dev.context.newPage()
  await page.goto(`chrome-extension://${dev.extensionId}/${fileName}`, {
    waitUntil: "domcontentloaded",
  })
  const result = await page.evaluate(async (origin) => {
    const { quoteCanonicalModelPrice } = await import(
      origin + "/src/services/modelPricing/quoteCanonicalModelPrice.ts"
    )
    const { readPublishedPricing } = await import(
      origin + "/src/services/modelPricing/publishedPricing.ts"
    )
    const { pricingPlanSchema } = await import(
      origin + "/src/services/modelPricing/pricingPlan.ts"
    )
    const response = await fetch(
      "https://api.aimlapi.com/v1/models?include=pricing",
      { signal: AbortSignal.timeout(30000) },
    )
    if (!response.ok)
      throw new Error(`Public catalogue HTTP ${response.status}`)
    const catalogue = await response.json()
    const records = catalogue.data.filter(
      (record) => record.id === "x-ai/grok-imagine-image",
    )
    const generation = records.find(
      (record) => record.type === "openai/image-generations",
    )
    const editing = records.find(
      (record) => record.type === "openai/image-editing",
    )
    const outputUnit = generation?.pricing.units.find(
      (unit) => unit.name === "generation" && unit.content === "image",
    )
    const editingOutput = editing?.pricing.units.find(
      (unit) => unit.name === "generation" && unit.content === "image",
    )
    const editingInput = editing?.pricing.units.find(
      (unit) => unit.name === "payload" && unit.content === "image",
    )
    if (
      generation?.pricing.kind !== "fixed" ||
      editing?.pricing.kind !== "variable" ||
      generation.pricing.currency !== "USD" ||
      editing.pricing.currency !== "USD" ||
      outputUnit?.price !== 0.02 ||
      outputUnit.per !== 1 ||
      outputUnit.variable !== false ||
      editingOutput?.price !== 0.02 ||
      editingOutput.per !== 1 ||
      editingOutput.variable !== true ||
      editingInput?.price !== 0.002 ||
      editingInput.per !== 1 ||
      editingInput.variable !== true ||
      editingInput.origin !== "provided" ||
      editingInput.measure !== "count"
    )
      throw new Error(
        "The source contract changed; review new evidence instead of reusing this probe",
      )

    const rate = (unit) => ({
      amount: unit.price,
      currency: "USD",
      unit: "image",
      per: unit.per,
    })
    const base = {
      model_name: generation.id,
      quota_type: 0,
      model_ratio: 0,
      model_price: 0,
      completion_ratio: 1,
      enable_groups: [],
      supported_endpoint_types: [],
    }
    const plan = {
      rates: {},
      rules: [
        {
          id: "generate",
          conditions: [
            {
              kind: "selection",
              axis: "generationMode",
              value: "image_generation",
            },
          ],
          rates: { image: rate(outputUnit) },
        },
        {
          id: "edit",
          conditions: [
            { kind: "selection", axis: "generationMode", value: "image_edit" },
          ],
          rates: {
            image: rate(editingOutput),
            referenceImage: rate(editingInput),
          },
        },
      ],
      requiresRuleMatch: true,
      usageMode: "image",
      groupMultiplier: "included",
      source: { kind: "catalog" },
      issues: [],
    }
    const candidates = [
      {
        name: "keep-global-variable-block",
        value: { ...plan, source: { ...plan.source, rulesUnavailable: true } },
      },
      { name: "clear-global-block", value: plan },
      {
        name: "scope-unknown-to-both-image-meters",
        value: {
          ...plan,
          issues: [
            { code: "unsupported-rule", meters: ["image", "referenceImage"] },
          ],
        },
      },
      {
        name: "scope-unknown-only-to-reference-image",
        value: {
          ...plan,
          issues: [{ code: "unsupported-rule", meters: ["referenceImage"] }],
        },
      },
    ]
    const rows = candidates.map(({ name, value }) => {
      const parsed = pricingPlanSchema.safeParse(value)
      if (!parsed.success)
        return {
          name,
          schemaValid: false,
          errors: parsed.error.issues,
          viable: false,
        }
      const model = { ...base, pricingPlan: parsed.data }
      const quote = (generationMode, usage) =>
        quoteCanonicalModelPrice(
          model,
          { purpose: "request", generationMode, usage },
          { currency: "USD" },
        )
      const generate = quote("image_generation", {
        image: 2,
        referenceImage: 0,
      })
      const edit = quote("image_edit", { image: 2, referenceImage: 1 })
      const unspecified = quote(undefined, { image: 2, referenceImage: 0 })
      const published = readPublishedPricing(parsed.data, 1)
      const editRates = published.schedule.find(
        (rule) => rule.id === "edit",
      )?.rates
      const keepsBothEditingReferences =
        editRates?.image?.amount === 0.02 &&
        editRates?.referenceImage?.amount === 0.002
      return {
        name,
        schemaValid: true,
        generate,
        edit,
        unspecified,
        published,
        keepsBothEditingReferences,
        // Editing's OUTPUT is variable too, so $0.04 cannot be a known subtotal.
        viable:
          generate.status === "complete" &&
          generate.amount === 0.04 &&
          edit.status === "unavailable" &&
          edit.amount === null &&
          !edit.lines.some((line) => line.amount > 0) &&
          unspecified.status !== "complete" &&
          keepsBothEditingReferences,
      }
    })
    return {
      at: new Date().toISOString(),
      records,
      rows,
      viable: rows.filter((row) => row.viable).map((row) => row.name),
    }
  }, origin)
  await fs.writeFile(
    path.join(evidence, "result.json"),
    JSON.stringify(result, null, 2),
  )
  if (result.rows.some((row) => !row.schemaValid))
    throw new Error(
      `An invalid schema makes this probe inconclusive: ${evidence}`,
    )
  console.log(
    JSON.stringify(
      {
        evidence,
        viable: result.viable,
        rows: result.rows.map((row) => ({
          name: row.name,
          schemaValid: row.schemaValid,
          viable: row.viable,
          generate: row.generate && {
            status: row.generate.status,
            amount: row.generate.amount,
          },
          edit: row.edit && {
            status: row.edit.status,
            amount: row.edit.amount,
            lines: row.edit.lines.map((line) => ({
              meter: line.meter,
              amount: line.amount,
            })),
          },
          unspecified: row.unspecified?.status,
        })),
      },
      null,
      2,
    ),
  )
} finally {
  await page?.close()
  await dev.close()
  if (created) await fs.unlink(ownedFile)
}
