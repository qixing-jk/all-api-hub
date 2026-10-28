import { execFileSync } from "node:child_process"
import fs from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { parseArgs } from "node:util"

import { KEY_MANAGEMENT_TEST_IDS as keys } from "../src/features/KeyManagement/testIds.ts"
import { connectWorktreeExtension, defaultCdpUrl } from "./cdp/client.mjs"
import { applyIsolateFlag } from "./cdp/dev-profile.mjs"
import { getAccounts } from "./cdp/sandbox.mjs"
import { dismissModals } from "./cdp/ui-driver.mjs"
import { runUiScenarios, validateUiScenarios } from "./cdp/ui-scenarios.mjs"
import { testAccountCardFlow } from "./flows/account-card.mjs"
import { testModelCatalogFlow } from "./flows/model-catalog.mjs"
import { openNativeKeyEditor } from "./flows/native-key-editor.mjs"
import { loadLocalEnv } from "./utils/local-env.mjs"

async function main() {
  const { values } = parseArgs({
    options: {
      scenario: { type: "string", multiple: true },
      "account-id": { type: "string" },
      field: { type: "string", multiple: true, default: [] },
      prod: { type: "boolean" },
      isolate: { type: "boolean" },
      list: { type: "boolean" },
      help: { type: "boolean" },
    },
  })
  const selected = values.scenario ?? ["options"]
  const fields = values.field.map((field) => field.trim())
  if (fields.some((field) => !field))
    throw new Error("Expected field labels must not be empty")
  const definitions = [
    { id: "options", covers: ["options.render"] },
    { id: "account", covers: ["account.card.identity"] },
    { id: "models", covers: ["models.catalog.render"] },
    {
      id: "key-editor",
      covers: [
        "keys.create-editor.open",
        ...fields.map((field) => `keys.create-editor.field:${field}`),
      ],
    },
  ]
  if (values.help) {
    console.log(`Usage: pnpm e2e:cdp -- [--prod] [--isolate] [--list]
  --scenario=options|account|models|key-editor (repeatable; default: options)
  --account-id=<saved-account-id>   Required except for options
  --field="Monthly limit (USD)"   Required for key-editor; repeat for each expected field

Uses the current-worktree dev build by default; --prod selects chrome-mv3.
Read-only inspection: key-editor opens the create form and closes it without saving.
Reports and screenshots are stored in a unique local temporary directory.
Exit: 0 selected scenarios passed; 1 failure; 2 missing prerequisites.
Partial selection does not establish complete site acceptance.`)
    return
  }
  if (values.list) {
    console.log(JSON.stringify(definitions, null, 2))
    return
  }
  validateUiScenarios(definitions, selected)
  loadLocalEnv()
  applyIsolateFlag(process.argv)
  const cdpUrl = process.env.CDP_URL || defaultCdpUrl()
  const extensionPath = path.resolve(
    values.prod ? ".output/chrome-mv3" : ".output/chrome-mv3-dev",
  )
  const evidenceDir = await fs.mkdtemp(path.join(tmpdir(), "aah-cdp-ui-"))
  const build = {
    capturedAt: new Date().toISOString(),
    worktree: process.cwd(),
    commit: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    extensionPath,
    cdpUrl,
    selected,
    dirty: Boolean(
      execFileSync("git", ["status", "--porcelain"], {
        encoding: "utf8",
      }).trim(),
    ),
    screenshots: [],
  }
  const evidence = { ...build }
  let dev
  let report
  try {
    dev = await connectWorktreeExtension({ cdpUrl, extensionPath })
    const { extensionId } = dev
    evidence.extensionId = extensionId
    const account = values["account-id"]
      ? (await getAccounts(dev.serviceWorker)).find(
          (item) => item.id === values["account-id"],
        )
      : undefined
    const accountPrerequisite = () =>
      account
        ? undefined
        : "Supply --account-id for an existing account in the selected extension"
    const route = (name) =>
      `chrome-extension://${extensionId}/options.html#${name}?accountId=${encodeURIComponent(account?.id ?? "")}`
    const inspect = async (id, run) => {
      const page = await dev.context.newPage()
      try {
        await page.emulateMedia({ reducedMotion: "reduce" })
        await run(page)
        const screenshot = path.join(evidenceDir, `${id}.png`)
        await page.screenshot({ path: screenshot, animations: "disabled" })
        evidence.screenshots.push({ scenario: id, path: screenshot })
      } catch (error) {
        const screenshot = path.join(evidenceDir, `${id}-failed.png`)
        try {
          await page.screenshot({
            path: screenshot,
            animations: "disabled",
            timeout: 5000,
          })
          evidence.screenshots.push({
            scenario: id,
            path: screenshot,
            failed: true,
          })
        } catch {
          // Preserve the original assertion failure if screenshot capture also fails.
        }
        throw error
      } finally {
        await page.close()
      }
    }
    const runs = {
      options: (page) => inspectOptions(page, extensionId),
      account: async (page) => {
        const result = await testAccountCardFlow({
          page,
          extensionId,
          accountName: account.site_name,
          accountId: account.id,
        })
        if (!result.ok) throw new Error("Account card is not visible")
      },
      models: (page) =>
        testModelCatalogFlow({
          page,
          extensionId,
          accountId: account.id,
          accountName: account.site_name,
          requirePrices: false,
          timeoutMs: 30_000,
        }),
      "key-editor": async (page) => {
        await page.goto(route("keys"))
        await dismissModals(page)
        const editor = await openNativeKeyEditor(page, {
          trigger: page
            .getByTestId(keys.addTokenButton)
            .or(page.getByTestId(keys.emptyStateAddTokenButton))
            .first(),
          readyField: fields[0],
        })
        for (const field of fields) {
          await editor
            .getByLabel(field)
            .waitFor({ state: "visible", timeout: 30_000 })
        }
      },
    }
    report = await runUiScenarios({
      selected,
      scenarios: definitions.map((definition) => ({
        ...definition,
        prerequisite: () =>
          definition.id === "options"
            ? undefined
            : accountPrerequisite() ??
              (definition.id === "key-editor" && !fields.length
                ? "Supply --field for each expected native create-editor field"
                : undefined),
        run: () => inspect(definition.id, runs[definition.id]),
      })),
    })
    process.exitCode = report.scenarios.some(
      ({ status }) => status === "failed",
    )
      ? 1
      : report.ok
        ? 0
        : 2
  } catch (error) {
    report = {
      ok: false,
      setupError: error.message,
      scenarios: definitions.map((definition) => ({
        ...definition,
        status: selected.includes(definition.id) ? "not_run" : "not_selected",
        reason: "UI setup did not complete",
        durationMs: 0,
      })),
    }
    throw error
  } finally {
    try {
      const reportPath = path.join(evidenceDir, "report.json")
      await fs.writeFile(
        reportPath,
        JSON.stringify({ ...evidence, ...report }, null, 2),
      )
      console.log(`CDP UI report: ${reportPath}`)
      if (report)
        console.table(
          report.scenarios.map(({ id, status, durationMs, reason }) => ({
            id,
            status,
            durationMs,
            reason,
          })),
        )
    } finally {
      await dev?.close()
    }
  }
}

async function inspectOptions(page, extensionId) {
  await page.goto(`chrome-extension://${extensionId}/options.html`)
  await page
    .locator('[data-testid="options-app"], #root')
    .first()
    .waitFor({ state: "visible", timeout: 30_000 })
  await page
    .getByRole("button")
    .first()
    .waitFor({ state: "visible", timeout: 30_000 })
  await dismissModals(page)
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
