// Read-only parity inspection. Requires the temp5 dev browser on port 9291,
// a logged-in Vercel tab, and an existing extension keys workspace.
// Opens create dialogs but never submits. Screenshots/text stay local.
import fs from "node:fs/promises"
import { chromium } from "playwright"

const out = ".scratch/vercel-ai-gateway/evidence/parity-2026-10-26"
await fs.mkdir(out, { recursive: true })
const browser = await chromium.connectOverCDP("http://127.0.0.1:9291")
const context = browser.contexts()[0]
const originals = context.pages()
const results = {}
try {
  for (const [kind, original] of [
    [
      "native",
      originals.find((p) => p.url().startsWith("https://vercel.com/")),
    ],
    [
      "extension",
      originals.find((p) => p.url().startsWith("chrome-extension:")),
    ],
  ]) {
    if (!original) {
      results[kind] = { error: "missing source tab" }
      continue
    }
    const page = await context.newPage()
    try {
      await page.setViewportSize({ width: 1440, height: 1000 })
      await page.emulateMedia({ reducedMotion: "reduce" })
      await page.goto(original.url(), {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      })
      if (kind === "native") {
        results.identity = await page.evaluate(async () => {
          const response = await fetch("/api/user", {
            credentials: "include",
            cache: "no-store",
          })
          const body = await response.json()
          return {
            status: response.status,
            hasUser: !!(body.user?.uid || body.user?.id),
          }
        })
        await page
          .getByRole("button", { name: "Create API Key", exact: true })
          .first()
          .click({ timeout: 30000 })
      } else {
        await page.getByTestId("options-app").waitFor({ timeout: 30000 })
        await page
          .locator(
            '[data-testid="key-management-add-token-button"], [data-testid="key-management-empty-state-add-token-button"]',
          )
          .first()
          .click({ timeout: 30000 })
      }
      const dialog = page.getByRole("dialog").last()
      await dialog.waitFor({ timeout: 30000 })
      await dialog.locator("input").first().waitFor({ timeout: 30000 })
      if (kind === "native") {
        const advanced = dialog.getByText("Advanced Configuration", {
          exact: true,
        })
        if (await advanced.count()) await advanced.click()
        await dialog.getByText("Spend Budget", { exact: true }).click()
        await dialog.getByText("Spend Budget ($)", { exact: true }).waitFor()
        await dialog
          .locator('input[type="number"]')
          .waitFor({ state: "visible" })
      }
      await page.screenshot({
        animations: "allow",
        path: `${out}/${kind}-create.png`,
      })
      results[kind] = {
        text: await dialog.innerText(),
        controls: await dialog
          .locator("input,select,textarea")
          .evaluateAll((els) =>
            els.map((el) => ({
              tag: el.tagName,
              type: el.type,
              placeholder: el.getAttribute("placeholder"),
              value: el.type === "password" ? "[redacted]" : el.value,
            })),
          ),
      }
    } catch (error) {
      results[kind] = { error: error.message }
    } finally {
      await page.close()
    }
  }
  await fs.writeFile(`${out}/result.json`, JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results, null, 2))
} finally {
  await browser.close()
}
