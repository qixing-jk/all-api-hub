import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"

import { findInstalledDevExtension } from "../../scripts/cdp/browser-runtime.mjs"
import { connectDevBrowser } from "../../scripts/cdp/client.mjs"

// Read-only protocol audit, separate from the maintained rendered UI acceptance.
// Prerequisites: current-worktree WXT dev output, its verified CDP browser and CDP_URL.
const output = path.resolve(".output/chrome-mv3-dev")
const options = await fs.readFile(path.join(output, "options.html"), "utf8")
const origin = options.match(
  /src="(http:\/\/(?:127\.0\.0\.1|localhost):\d+)\/@vite\/client/,
)?.[1]
if (!origin)
  throw new Error("A live current-worktree Vite development output is required")
const root = ".scratch/visual-captures/aimlapi-audit"
await fs.mkdir(root, { recursive: true })
const evidenceDir = await fs.mkdtemp(path.join(root, "structured-catalog-"))
const fileName = `aah-pricing-audit-${randomUUID()}.html`
const ownedFile = path.join(output, fileName)
const dev = await connectDevBrowser()
let page,
  created = false
try {
  const id = await findInstalledDevExtension(dev.browser, output)
  if (!id)
    throw new Error(
      "The exact current-worktree dev extension must be installed",
    )
  // Avoid React bootstrap cost when measuring the provider request. This generated
  // document is owned by this run and removed afterwards; no manifest is edited.
  await fs.writeFile(
    ownedFile,
    "<!doctype html><meta charset=utf-8><title>AAH public pricing audit</title>",
    { flag: "wx" },
  )
  created = true
  page = await dev.context.newPage()
  const replayPath = process.argv
    .find((arg) => arg.startsWith("--responses="))
    ?.slice(12)
  if (replayPath) {
    const captured = JSON.parse(await fs.readFile(replayPath, "utf8"))
    await page.route(/^https:\/\/(api\.)?aimlapi\.com\//, async (route) => {
      const response = captured.find(
        (item) => item.url === route.request().url(),
      )
      if (!response)
        throw new Error(
          `Unrecorded request blocked during replay: ${route.request().url()}`,
        )
      await route.fulfill({
        status: response.status,
        body: response.body,
        contentType: response.url.includes("/v1/models")
          ? "application/json"
          : "text/html",
      })
    })
  }
  await page.goto(`chrome-extension://${id}/${fileName}`, {
    waitUntil: "domcontentloaded",
  })
  const responses = [],
    pending = []
  page.on("response", (response) => {
    if (/^https:\/\/(api\.)?aimlapi\.com\//.test(response.url()))
      pending.push(
        response.text().then((body) =>
          responses.push({
            url: response.url(),
            status: response.status(),
            body,
          }),
        ),
      )
  })
  const result = await page.evaluate(async (base) => {
    const { aimlApiProviderModelCatalog } = await import(
      base + "/src/services/apiAdapters/aimlapi/modelCatalog.ts"
    )
    const { isValidProviderModelCatalogPricing } = await import(
      base + "/src/services/modelList/providerCatalogAdmission.ts"
    )
    const { buildPricingDiagnostics } = await import(
      base + "/src/features/ModelList/pricing/pricingDiagnostics.ts"
    )
    const { calculateModelPrice } = await import(
      base + "/src/services/models/utils/modelPricing.ts"
    )
    const { readPublishedPricing } = await import(
      base + "/src/services/modelPricing/publishedPricing.ts"
    )
    const { resolveCanonicalPricingPlan } = await import(
      base + "/src/services/modelPricing/canonicalPricingPlan.ts"
    )
    const start = performance.now()
    const catalog = await aimlApiProviderModelCatalog.fetchPricing({
      abortSignal: AbortSignal.timeout(30000),
    })
    const source = {
      kind: "profile",
      profile: { name: "AI/ML API", baseUrl: "https://aimlapi.com" },
    }
    const report = buildPricingDiagnostics(
      catalog.data.map((model) => ({
        model,
        source,
        calculatedPrice: {
          ...calculateModelPrice(model, 1),
          publishedPricing: readPublishedPricing(
            resolveCanonicalPricingPlan(model, 1),
            1,
          ),
        },
      })),
    )
    return {
      at: new Date().toISOString(),
      milliseconds: performance.now() - start,
      admitted: isValidProviderModelCatalogPricing(catalog, "aimlapi"),
      data: catalog.data,
      report,
    }
  }, origin)
  result.sourceMode = replayPath ? `replay:${replayPath}` : "live"
  await Promise.all(pending)
  await Promise.all([
    fs.writeFile(
      path.join(evidenceDir, "catalog.json"),
      JSON.stringify(result, null, 2),
    ),
    fs.writeFile(
      path.join(evidenceDir, "responses.json"),
      JSON.stringify(responses),
    ),
  ])
  if (!result.admitted)
    throw new Error(`Catalog admission failed; evidence: ${evidenceDir}`)
  await Promise.all([
    fs.writeFile(
      `${root}/remaining-current.json`,
      JSON.stringify(result, null, 2),
    ),
    fs.writeFile(`${root}/remaining-responses.json`, JSON.stringify(responses)),
  ])
  const withoutNumericRates = result.data.filter(
    (model) =>
      ![
        model.pricingPlan?.rates ?? {},
        ...(model.pricingPlan?.rules ?? []).map((rule) => rule.rates),
      ].some((rates) => Object.keys(rates).length),
  )
  console.log(
    JSON.stringify(
      {
        evidenceDir,
        admitted: result.admitted,
        milliseconds: result.milliseconds,
        total: result.data.length,
        withoutNumericRates: withoutNumericRates.length,
        requests: responses.map((response) => ({
          url: response.url,
          status: response.status,
        })),
        summary: result.report.summary,
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
