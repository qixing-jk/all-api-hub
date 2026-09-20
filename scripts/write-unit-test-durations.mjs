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

import {
  correctForShardLoad,
  summarizeBlobReports,
} from "./utils/unitTestDurations.mjs"

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const reportsDir = path.resolve(rootDir, process.argv[2] ?? ".vitest-reports")
const outputPath = path.resolve(
  rootDir,
  process.argv[3] ?? ".vitest-durations/shard-durations.json",
)

/**
 * @param blob Parsed blob report.
 * @returns Its test-file entries.
 */
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

const reports = []
const reportedShards = new Set()
let declaredShards = 0
for (const reportFile of reportFiles) {
  const match = /^blob-(\d+)-(\d+)\.json$/.exec(reportFile)
  const blob = parse(fs.readFileSync(path.join(reportsDir, reportFile), "utf8"))
  reports.push({
    shard: match ? Number(match[1]) : null,
    files: fileEntries(blob),
  })
  if (match) {
    reportedShards.add(Number(match[1]))
    declaredShards = Number(match[2])
  }
}

// Blob names carry the shard selection they were produced under (`blob-2-6.json`). When
// fewer reports arrive than the run had shards, the manifest is partial and the gaps fall
// back to the median weight, so say so rather than shipping a quietly weaker split.
if (declaredShards > 0 && reportedShards.size < declaredShards) {
  console.warn(
    `Read ${reportedShards.size} of ${declaredShards} shard reports; files without a duration fall back to the median weight.`,
  )
}

const { entries, shardTotals } = summarizeBlobReports(reports)
const corrected = correctForShardLoad(entries, shardTotals)
if (!corrected) {
  console.warn(
    "Shard attribution is incomplete, so measured costs are published uncorrected; shard packing will chase this run's imbalance more than usual.",
  )
}

const sorted = [...(corrected ?? entries)].sort(([a], [b]) =>
  a < b ? -1 : a > b ? 1 : 0,
)
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
  `Wrote ${sorted.length} file durations (${(totalMs / 1000).toFixed(0)}s of load-corrected single-worker work) to ${path.relative(rootDir, outputPath)} from ${reportFiles.length} blob report(s)`,
)
console.log(
  `Heaviest: ${sorted
    .slice()
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([file, ms]) => `${file} ${(ms / 1000).toFixed(0)}s`)
    .join(", ")}`,
)
