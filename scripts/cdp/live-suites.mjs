import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import {
  runUiScenarios,
  UI_SCENARIO_STATUSES,
  validateUiScenarios,
} from "./ui-scenarios.mjs"

/**
 * Aggregate independent live suites without mistaking partial execution for full acceptance.
 * Callbacks must restore their owned resources before returning or throwing.
 * Return { ok: false } for failure or { skipped: true, reason } for incomplete checks.
 * Reports deliberately omit raw callback payloads, which may contain credentials.
 */
export async function runLiveSuites({
  suite,
  suites,
  evidenceDir,
  environment = {},
}) {
  const selected = suite === "all" ? suites.map(({ id }) => id) : [suite]
  validateUiScenarios(suites, selected)
  const root = evidenceDir ?? os.tmpdir()
  await fs.mkdir(root, { recursive: true })
  evidenceDir = await fs.mkdtemp(path.join(root, "aah-cdp-suites-"))
  const startedAt = new Date().toISOString()
  const outcomes = await runUiScenarios({
    scenarios: suites,
    selected,
    continueOnFailure: true,
  })
  const report = {
    suite,
    selected,
    allSelected: selected.length === suites.length,
    startedAt,
    ...outcomes,
    environment: { worktree: process.cwd(), ...environment },
    finishedAt: new Date().toISOString(),
  }
  const reportFile = path.join(evidenceDir, "report.json")
  await fs.writeFile(reportFile, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ ...report, reportFile }, null, 2))
  if (!report.ok) {
    const gaps = report.scenarios.filter(
      ({ status }) =>
        ![
          UI_SCENARIO_STATUSES.Passed,
          UI_SCENARIO_STATUSES.NotSelected,
        ].includes(status),
    )
    throw new Error(
      `Live acceptance incomplete: ${gaps.map(({ id, status, reason }) => `${id} (${status}): ${reason}`).join(", ")}; report: ${reportFile}`,
    )
  }
  return { ...report, reportFile }
}
