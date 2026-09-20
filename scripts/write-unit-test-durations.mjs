#!/usr/bin/env node
/**
 * Writes per-file unit-test durations from the blob reports Vitest already emits per shard.
 *
 * `vitest.shardSequencer.ts` reads the result to slice shards by measured cost instead of by
 * file count, and the `unit-tests-merge` job publishes it to the Actions cache so the next
 * run's shards start from it. CI is the only automated producer; running it locally is a
 * convenience for reproducing a split.
 *
 * Usage: node scripts/write-unit-test-durations.mjs [reports-dir] [output-file]
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parse } from "flatted"

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const reportsDir = path.resolve(rootDir, process.argv[2] ?? ".vitest-reports")
const outputPath = path.resolve(
  rootDir,
  process.argv[3] ?? ".vitest-durations/shard-durations.json",
)

/**
 * A file's cost is not just its test bodies: for the jsdom project, collection and
 * environment setup are per-file costs that a shard pays before a single assertion runs,
 * so a weighting that ignored them would systematically under-rate the dom files.
 * @param file Blob report entry for one test file.
 * @returns Milliseconds this file occupies a worker.
 */
const fileCost = (file) =>
  (file.result?.duration ?? 0) +
  (file.setupDuration ?? 0) +
  (file.prepareDuration ?? 0) +
  (file.collectDuration ?? 0) +
  (file.environmentLoad ?? 0)

/** @param blob Parsed blob report. */
const fileEntries = (blob) => {
  // Blob reports are `[version, files, ...]` after flatted decoding.
  const files = Array.isArray(blob) ? blob[1] : undefined
  if (!Array.isArray(files)) {
    throw new Error(
      "Unrecognised blob report shape: expected [version, files, ...]",
    )
  }
  return files
}

const reportFiles = fs
  .readdirSync(reportsDir)
  .filter((name) => name.endsWith(".json"))
  .sort()

if (reportFiles.length === 0) {
  throw new Error(
    `No blob reports found in ${path.relative(rootDir, reportsDir)} — run Vitest with --reporter=blob first`,
  )
}

/** Per-file milliseconds, summed across the reports of every shard. */
const durations = new Map()
for (const reportFile of reportFiles) {
  const blob = parse(fs.readFileSync(path.join(reportsDir, reportFile), "utf8"))
  for (const file of fileEntries(blob)) {
    // `name` is relative to the Vitest root, so the manifest stays portable across
    // machines (CI runners check out under different absolute paths than a laptop).
    const key = file.name
    if (typeof key !== "string") continue
    durations.set(key, (durations.get(key) ?? 0) + fileCost(file))
  }
}

// Blob names carry the shard selection they were produced under (`blob-2-6.json`). When
// fewer reports arrive than the run had shards, the manifest is partial and the gaps fall
// back to the median weight, so say so rather than shipping a quietly weaker split.
const reportedShards = new Set()
let declaredShards = 0
for (const reportFile of reportFiles) {
  const match = /^blob-(\d+)-(\d+)\.json$/.exec(reportFile)
  if (!match) continue
  reportedShards.add(Number(match[1]))
  declaredShards = Number(match[2])
}
if (declaredShards > 0 && reportedShards.size < declaredShards) {
  console.warn(
    `Read ${reportedShards.size} of ${declaredShards} shard reports; files without a duration fall back to the median weight.`,
  )
}

const sorted = [...durations].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
const rounded = Object.fromEntries(
  sorted.map(([file, ms]) => [file, Math.round(ms)]),
)
const totalMs = sorted.reduce((sum, [, ms]) => sum + ms, 0)

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(
  outputPath,
  `${JSON.stringify(
    {
      version: 1,
      generatedAt: new Date().toISOString(),
      durations: rounded,
    },
    null,
    2,
  )}\n`,
  "utf8",
)

console.log(
  `Wrote ${sorted.length} file durations (${(totalMs / 1000).toFixed(0)}s of single-worker work) to ${path.relative(rootDir, outputPath)} from ${reportFiles.length} blob report(s)`,
)
console.log(
  `Heaviest: ${sorted
    .slice()
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([file, ms]) => `${file} ${(ms / 1000).toFixed(0)}s`)
    .join(", ")}`,
)
