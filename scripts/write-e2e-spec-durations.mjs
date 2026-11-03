#!/usr/bin/env node
/**
 * Writes per-spec E2E durations from the JSON reports each shard emits.
 *
 * `scripts/e2e-shard-plan.mjs` reads the result to pack shards by measured duration
 * instead of by test count, and the E2E workflow publishes it to the Actions cache so
 * the next run starts from it. CI is the only automated producer.
 *
 * Usage: node scripts/write-e2e-spec-durations.mjs [reports-dir] [output-file]
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { DEFAULT_SPEC_DURATIONS_PATH } from "../e2e/utils/e2eShardPlan.shared.js"

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const reportsDir = path.resolve(
  rootDir,
  process.argv[2] ?? ".e2e-durations/reports",
)
const outputPath = path.resolve(
  rootDir,
  process.argv[3] ?? DEFAULT_SPEC_DURATIONS_PATH,
)

const reportFiles = fs
  .readdirSync(reportsDir, { recursive: true })
  .map((name) => path.join(reportsDir, name))
  .filter((file) => file.endsWith(".json"))

if (reportFiles.length === 0) {
  throw new Error(
    `No Playwright JSON reports found in ${path.relative(rootDir, reportsDir)} — run the E2E workflow with JSON reporting first`,
  )
}

const durations = new Map()

for (const reportFile of reportFiles) {
  const report = JSON.parse(fs.readFileSync(reportFile, "utf8"))
  const perFile = new Map()
  for (const [file, duration] of collectFileDurations(report)) {
    perFile.set(file, (perFile.get(file) ?? 0) + duration)
  }
  for (const [file, duration] of perFile) {
    // Each spec belongs to exactly one shard; a repeat means a retried report, and the
    // slower measurement is the safer weight.
    durations.set(file, Math.max(durations.get(file) ?? 0, duration))
  }
}

if (durations.size === 0) {
  throw new Error("Playwright JSON reports contained no test files")
}

const sorted = Object.fromEntries(
  [...durations.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
)
fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(
  outputPath,
  `${JSON.stringify(
    {
      version: 1,
      generatedAt: new Date().toISOString(),
      durations: sorted,
    },
    null,
    2,
  )}\n`,
  "utf8",
)
console.log(
  `Wrote ${Object.keys(sorted).length} spec durations to ${path.relative(rootDir, outputPath)}`,
)

/**
 * Walks one report's suite tree.
 * @param report Parsed Playwright JSON report.
 * @returns Repository-relative spec path and total milliseconds.
 */
function collectFileDurations(report) {
  const result = []
  const walk = (suite, inheritedFile) => {
    const file = suite?.file ?? inheritedFile
    for (const spec of suite?.specs ?? []) {
      const specFile = spec?.file ?? file
      if (typeof specFile !== "string") continue
      let milliseconds = 0
      for (const test of spec.tests ?? []) {
        const results = test?.results ?? []
        const last = results[results.length - 1]
        if (last && typeof last.duration === "number") {
          milliseconds += last.duration
        }
      }
      // Setup files and other non-spec suites have no place in the shard plan.
      if (milliseconds > 0 && specFile.endsWith(".spec.ts")) {
        result.push([normalizeSpecPath(specFile), milliseconds])
      }
    }
    for (const child of suite?.suites ?? []) walk(child, file)
  }
  for (const suite of report?.suites ?? []) walk(suite, undefined)
  return result
}

/**
 * Playwright reports paths relative to `testDir` (`e2e`), while the shard planner keys
 * specs by repository-relative path.
 * @param file Path from the report.
 * @returns Repository-relative posix path.
 */
function normalizeSpecPath(file) {
  let relative = path.isAbsolute(file)
    ? path.relative(rootDir, file)
    : file.replace(/^\.\//u, "")
  relative = relative.split(path.sep).join("/")
  return relative.startsWith("e2e/") ? relative : `e2e/${relative}`
}
