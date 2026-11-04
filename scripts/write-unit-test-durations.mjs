#!/usr/bin/env node
/**
 * Writes per-file unit-test durations from Vitest blob reports.
 *
 * The CI report guard can reuse the reports it already decoded. The standalone CLI
 * remains available for replaying downloaded reports.
 *
 * Usage: node scripts/write-unit-test-durations.mjs [reports-dir] [output-file]
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  correctForShardLoad,
  summarizeBlobReports,
} from "./utils/unitTestDurations.mjs"
import { parseVitestBlob } from "./utils/vitestBlob.mjs"

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

/**
 * Keep only the fields needed for file costs, so decoded task and coverage graphs
 * can be released before the next large report is read.
 * @param blob Parsed Vitest blob report.
 * @returns File timing entries.
 */
export function extractFileTimings(blob) {
  const files = Array.isArray(blob) ? blob[1] : undefined
  if (!Array.isArray(files)) {
    throw new Error(
      "Unrecognised blob report shape: expected [version, files, ...]",
    )
  }
  return files.map((file) => ({
    name: file.name,
    result: { duration: file.result?.duration },
    setupDuration: file.setupDuration,
    prepareDuration: file.prepareDuration,
    collectDuration: file.collectDuration,
    environmentLoad: file.environmentLoad,
  }))
}

/**
 * Publish timings from reports that the caller has already decoded.
 * @param reports File timings with their source shard.
 * @param outputPath Destination manifest path.
 * @returns Nothing.
 */
export function writeUnitTestDurationsFromReports(reports, outputPath) {
  const { entries, shardTotals } = summarizeBlobReports(reports)
  const corrected = correctForShardLoad(entries, shardTotals)
  if (!corrected) {
    console.warn(
      "Shard attribution is incomplete, so measured costs are published uncorrected; shard packing will chase this run's imbalance more than usual.",
    )
  }

  const weights =
    corrected ?? new Map([...entries].map(([file, { cost }]) => [file, cost]))
  const sorted = [...weights].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
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
    `Wrote ${sorted.length} file durations (${(totalMs / 1000).toFixed(0)}s of ${corrected ? "load-corrected" : "raw"} single-worker work) to ${path.relative(rootDir, outputPath)} from ${reports.length} blob report(s)`,
  )
  console.log(
    `Heaviest: ${sorted
      .slice()
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([file, ms]) => `${file} ${(ms / 1000).toFixed(0)}s`)
      .join(", ")}`,
  )
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const reportsDir = path.resolve(rootDir, process.argv[2] ?? ".vitest-reports")
  const outputPath = path.resolve(
    rootDir,
    process.argv[3] ?? ".vitest-durations/shard-durations.json",
  )
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
    const blob = parseVitestBlob(
      fs.readFileSync(path.join(reportsDir, reportFile), "utf8"),
    )
    reports.push({
      shard: match ? Number(match[1]) : null,
      files: extractFileTimings(blob),
    })
    if (match) {
      reportedShards.add(Number(match[1]))
      declaredShards = Number(match[2])
    }
  }

  if (declaredShards > 0 && reportedShards.size < declaredShards) {
    console.warn(
      `Read ${reportedShards.size} of ${declaredShards} shard reports; files without a duration fall back to the median weight.`,
    )
  }
  writeUnitTestDurationsFromReports(reports, outputPath)
}
