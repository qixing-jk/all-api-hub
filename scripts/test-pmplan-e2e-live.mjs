import path from "node:path"
import { fileURLToPath } from "node:url"

import { runScenarioWithCleanup } from "../e2e/utils/scenarioErrors.ts"
import { PMPLAN_WEB_ORIGIN } from "../src/services/accountSiteDefinitions/identifiers.ts"
import { connectWorktreeExtension } from "./cdp/client.mjs"
import { applyIsolateFlag } from "./cdp/dev-profile.mjs"
import { runLiveSuites } from "./cdp/live-suites.mjs"
import { runPmplanPricing } from "./suites/pmplan/pricing.mjs"
import { runPmplanProbe } from "./suites/pmplan/probe.mjs"
import { runPmplanUi } from "./suites/pmplan/ui.mjs"
import { runPmplanUpstream } from "./suites/pmplan/upstream.mjs"
import { loadLocalEnv } from "./utils/local-env.mjs"

/** The website must already be logged in; --write creates and revokes disposable native keys. */
export async function main(args = process.argv.slice(2)) {
  await loadLocalEnv()
  applyIsolateFlag(args)
  const known = args.filter((arg) => arg !== "--")
  for (const arg of known)
    if (
      !["--isolate", "--write", "--prod", "--help"].includes(arg) &&
      !arg.startsWith("--suite=") &&
      !arg.startsWith("--evidence-dir=")
    )
      throw new Error(`Unknown argument: ${arg}`)
  if (known.includes("--help")) {
    console.log(
      "PM-Plan current-worktree acceptance: [--isolate] [--prod] [--suite=all|probe|ui|upstream|pricing] [--write] [--evidence-dir=<ignored path>]. Requires an existing PM-Plan login; upstream and pricing also require an existing UI-added account. PMPLAN_USER_ID optionally binds the expected identity. Without --write the key lifecycle is reported blocked. Pricing is read-only. No paid inference or check-in grant is sent.",
    )
    return
  }
  if (known.includes("--write") && !known.includes("--isolate"))
    throw new Error("PM-Plan native writes require --isolate")
  const suite =
    known.find((arg) => arg.startsWith("--suite="))?.slice(8) ?? "all"
  const evidenceDir = path.resolve(
    known.find((arg) => arg.startsWith("--evidence-dir="))?.slice(15) ??
      `.scratch/pmplan/evidence/live-${Date.now()}`,
  )
  const environment = {
    targetUrl: PMPLAN_WEB_ORIGIN,
    build: known.includes("--prod") ? "production" : "development",
  }
  const connect = () =>
    connectWorktreeExtension({
      extensionPath: path.resolve(
        known.includes("--prod")
          ? ".output/chrome-mv3"
          : ".output/chrome-mv3-dev",
      ),
    })
  const run = async (work) => {
    const dev = await connect()
    environment.extensionId = dev.extensionId
    return runScenarioWithCleanup({
      run: () => work(dev),
      finalizers: [() => dev.close()],
      cleanupMessage: "PM-Plan connection cleanup failed",
      failureMessage: "PM-Plan acceptance and cleanup failed",
    })
  }
  return runLiveSuites({
    suite,
    evidenceDir,
    environment,
    suites: [
      {
        id: "pricing",
        covers: [
          "pricing.structured-rates",
          "pricing.zero",
          "pricing.eligibility",
          "pricing.details",
          "pricing.sort-estimate",
          "pricing.narrow-layout",
        ],
        run: () => run((dev) => runPmplanPricing({ ...dev, evidenceDir })),
      },
      {
        id: "upstream",
        covers: [
          "usage.resettable-cost-excluded",
          "pricing.catalog-minima",
          "keys.edit.clear.reopen",
          "notices.account-source",
        ],
        run: () =>
          run((dev) =>
            runPmplanUpstream({
              ...dev,
              evidenceDir,
              write: known.includes("--write"),
            }),
          ),
      },
      {
        id: "probe",
        covers: [
          "native.identity",
          "native.allowances",
          "native.keys",
          "native.model-scopes",
          "native.usage",
          "native.checkin",
        ],
        run: () => run((dev) => runPmplanProbe({ ...dev, evidenceDir })),
      },
      {
        id: "ui",
        covers: [
          "onboarding.save.reopen",
          "account.refresh.no-tab",
          "native.editor.defaults.options.cancel",
          "keys.create.save.reopen.revoke",
          "account-and-runtime-models",
          "navigation.action-gates",
        ],
        run: () =>
          run((dev) =>
            runPmplanUi({
              ...dev,
              evidenceDir,
              write: known.includes("--write"),
            }),
          ),
      },
    ],
  })
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
