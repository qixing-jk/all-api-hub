import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { chromium } from "@playwright/test"
import { expect, it, vi } from "vitest"

// @ts-expect-error Node-only live suite does not have declarations.
import * as pmplanPricing from "~~/scripts/suites/pmplan/pricing.mjs"
// @ts-expect-error Node-only live suite does not have declarations.
import { runPmplanProbe } from "~~/scripts/suites/pmplan/probe.mjs"
// @ts-expect-error Node-only live suite does not have declarations.
import { runPmplanUi } from "~~/scripts/suites/pmplan/ui.mjs"
// @ts-expect-error Node-only live suite does not have declarations.
import { runPmplanUpstream } from "~~/scripts/suites/pmplan/upstream.mjs"

const { assertPmplanModelPrices, runPmplanPricing } = pmplanPricing

it("checks each native price field within its exact model card", async () => {
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    await page.setContent(
      '<main><div data-slot="card"><h3>model-a</h3><div><span>Input</span><span>$1.00/M</span></div><div><span>Output</span><span>$2.00/M</span></div></div><div data-slot="card"><h3>model-b</h3><div><span>Output</span><span>$1.00/M</span></div></div></main>',
    )
    const model = {
      name: "model-a",
      input_micro: 1000000,
      output_micro: 1000000,
    }
    await expect(
      assertPmplanModelPrices(page.locator("main"), model, 100),
    ).rejects.toThrow()
    await page.getByText("$2.00/M").evaluate((element) => {
      element.textContent = "$1.00/M"
    })
    await expect(
      assertPmplanModelPrices(page.locator("main"), model, 100),
    ).resolves.toBeUndefined()
  } finally {
    await browser.close()
  }
})

it.each([
  ["ui", runPmplanUi],
  ["pricing", runPmplanPricing],
  ["upstream", runPmplanUpstream],
])(
  "%s closes its first page if second page acquisition fails",
  async (_name, run) => {
    const browser = await chromium.launch({ headless: true })
    const evidenceDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "pmplan-lifecycle-"),
    )
    try {
      const context = await browser.newContext()
      const first = await context.newPage()
      vi.spyOn(context, "newPage")
        .mockResolvedValueOnce(first)
        .mockRejectedValueOnce(new Error("page acquisition failed"))
      await expect(
        run({
          context,
          serviceWorker: {},
          extensionId: "fixture",
          evidenceDir,
          write: false,
        }),
      ).rejects.toThrow("page acquisition failed")
      expect(first.isClosed()).toBe(true)
    } finally {
      vi.restoreAllMocks()
      await browser.close()
      await fs.rm(evidenceDir, { recursive: true })
    }
  },
)

it("fails a native probe error and preserves it alongside a page cleanup failure", async () => {
  const browser = await chromium.launch({ headless: true })
  const evidenceDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "pmplan-probe-failure-"),
  )
  try {
    const context = await browser.newContext()
    const page = await context.newPage()
    await context.route("https://plan.pmcat.top/**", (route) =>
      route.fulfill({ status: 500, json: { error: "unavailable" } }),
    )
    vi.spyOn(context, "newPage").mockResolvedValue(page)
    vi.spyOn(page, "close").mockRejectedValue(new Error("page close failed"))
    const failure = await runPmplanProbe({ context, evidenceDir }).catch(
      (error: unknown) => error,
    )
    expect(failure).toBeInstanceOf(AggregateError)
    expect((failure as AggregateError).errors.map(String).join(" ")).toMatch(
      /probe-failed/,
    )
    expect((failure as AggregateError).errors.map(String).join(" ")).toMatch(
      /page close failed/,
    )
  } finally {
    vi.restoreAllMocks()
    await browser.close()
    await fs.rm(evidenceDir, { recursive: true })
  }
})

it("records UI cleanup failures before persisting its report", async () => {
  const browser = await chromium.launch({ headless: true })
  const evidenceDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "pmplan-cleanup-report-"),
  )
  try {
    const context = await browser.newContext()
    const first = await context.newPage()
    vi.spyOn(context, "newPage")
      .mockResolvedValueOnce(first)
      .mockRejectedValueOnce(new Error("page acquisition failed"))
    vi.spyOn(first, "close").mockRejectedValue(new Error("page close failed"))
    const failure = await runPmplanUi({
      context,
      serviceWorker: {},
      extensionId: "fixture",
      evidenceDir,
      write: false,
    }).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(AggregateError)
    const report = JSON.parse(
      await fs.readFile(path.join(evidenceDir, "ui-report.json"), "utf8"),
    )
    expect(report.cleanup.errors).toContain("page close failed")
  } finally {
    vi.restoreAllMocks()
    await browser.close()
    await fs.rm(evidenceDir, { recursive: true })
  }
})
