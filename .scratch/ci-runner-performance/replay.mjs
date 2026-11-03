#!/usr/bin/env node
/**
 * Replays the frozen CI measurements described in spec.md.
 * This checks captured shard membership and distribution; it does not benchmark relocated tests.
 * Requires Node 24, installed repository dependencies, and the downloaded reports or lean snapshot.
 */
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { parse } from "flatted"

import {
  listShardableSpecs,
  planSpecShard,
} from "../../e2e/utils/e2eShardPlan.shared.js"
import {
  correctForShardLoad,
  measureFileCost,
  summarizeBlobReports,
} from "../../scripts/utils/unitTestDurations.mjs"
import { assignShards, fallbackWeight } from "../../vitest.shardSequencer.ts"

const featureDir = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(featureDir, "../..")
const { values } = parseArgs({
  options: {
    "input-root": { type: "string" },
    output: { type: "string" },
  },
})
if (!values["input-root"]) {
  throw new Error(
    "Usage: node .scratch/ci-runner-performance/replay.mjs --input-root <reports-dir> [--output <summary.json>]",
  )
}
const inputRoot = path.resolve(values["input-root"])
const outputPath = path.resolve(
  values.output ?? path.join(featureDir, "artifacts/replay-summary.json"),
)
fs.mkdirSync(path.dirname(outputPath), { recursive: true })
const seconds = (milliseconds) => Math.round(milliseconds / 10) / 100
const leanPath = path.join(inputRoot, "unit-all-lean-records.json")

function readUnitRun(directory) {
  const files = []
  for (let shard = 1; shard <= 6; shard++) {
    const reportPath = path.join(
      inputRoot,
      directory,
      "vitest-blob-report-" + shard,
      "blob-" + shard + "-6.json",
    )
    const blob = parse(fs.readFileSync(reportPath, "utf8"))
    assert.ok(
      Array.isArray(blob[1]),
      "Expected Vitest [version, files, ...] report",
    )
    for (const file of blob[1]) {
      files.push({
        name: file.name,
        shard,
        projectName: file.projectName,
        result: { duration: file.result?.duration },
        setupDuration: file.setupDuration,
        prepareDuration: file.prepareDuration,
        collectDuration: file.collectDuration,
        environmentLoad: file.environmentLoad,
      })
    }
  }
  return files
}

const runs = fs.existsSync(leanPath)
  ? JSON.parse(fs.readFileSync(leanPath, "utf8"))
  : {
      baseline: readUnitRun("baseline"),
      final: readUnitRun("final-pr"),
      main: readUnitRun("merged-main"),
    }
for (const [name, files] of Object.entries(runs)) {
  assert.deepEqual(
    [...new Set(files.map((file) => file.shard))].sort(),
    [1, 2, 3, 4, 5, 6],
    name + " must contain all six shards",
  )
  assert.equal(
    new Set(files.map((file) => file.name)).size,
    files.length,
    name + " contains duplicate file keys",
  )
}
assert.equal(runs.main.length, runs.final.length, "Main/PR file sets differ")
const finalMembership = new Map(
  runs.final.map((file) => [file.name, file.shard]),
)
for (const file of runs.main) {
  assert.equal(
    finalMembership.get(file.name),
    file.shard,
    "Main/PR assignment differs: " + file.name,
  )
}

function unitWeights(files, corrected) {
  const reports = Array.from({ length: 6 }, (_, index) => ({
    shard: index + 1,
    files: files.filter((file) => file.shard === index + 1),
  }))
  const { entries, shardTotals } = summarizeBlobReports(reports)
  const weights = corrected
    ? correctForShardLoad(entries, shardTotals)
    : new Map([...entries].map(([key, entry]) => [key, entry.cost]))
  assert.ok(weights, "Invalid shard attribution or empty measurements")
  return Object.fromEntries(
    [...weights].map(([key, cost]) => [key, Math.round(cost)]),
  )
}

function unitPlan(files, weights) {
  const known = files
    .map((file) => weights[file.name])
    .filter((weight) => typeof weight === "number")
  assert.ok(known.length > 0, "Manifest does not describe these tests")
  const fallback = fallbackWeight(known)
  return assignShards(
    files.map((file) => ({
      key: file.name,
      weight: weights[file.name] ?? fallback,
    })),
    6,
  )
}

const baselineCorrected = unitWeights(runs.baseline, true)
const expectedFinal = unitPlan(runs.final, baselineCorrected)
expectedFinal.forEach((files, index) => {
  for (const file of files) {
    assert.equal(
      finalMembership.get(file.key),
      index + 1,
      "Cached weights do not reproduce PR assignment: " + file.key,
    )
  }
})

const comparisons = []
for (const [source, corrected, target] of [
  ["baseline", true, "final"],
  ["baseline", false, "final"],
  ["baseline", true, "main"],
  ["baseline", false, "main"],
  ["final", true, "main"],
  ["final", false, "main"],
]) {
  const plan = unitPlan(runs[target], unitWeights(runs[source], corrected))
  const observed = new Map(
    runs[target].map((file) => [file.name, measureFileCost(file)]),
  )
  const loads = plan.map((shard) =>
    shard.reduce((sum, file) => sum + observed.get(file.key), 0),
  )
  const mean = loads.reduce((sum, load) => sum + load, 0) / loads.length
  comparisons.push({
    source,
    corrected,
    target,
    maximumOverMean: Math.round((Math.max(...loads) / mean) * 1000) / 1000,
    maximumOverMinimum:
      Math.round((Math.max(...loads) / Math.min(...loads)) * 1000) / 1000,
    evaluatedWorkerSeconds: loads.map(seconds),
  })
}

function unitSummary(files) {
  return Array.from({ length: 6 }, (_, index) => {
    const shard = files.filter((file) => file.shard === index + 1)
    return {
      shard: index + 1,
      files: shard.length,
      domFiles: shard.filter((file) => file.projectName === "dom").length,
      workerSeconds: seconds(
        shard.reduce((sum, file) => sum + measureFileCost(file), 0),
      ),
      collectSeconds: seconds(
        shard.reduce((sum, file) => sum + (file.collectDuration ?? 0), 0),
      ),
      testBodySeconds: seconds(
        shard.reduce((sum, file) => sum + (file.result?.duration ?? 0), 0),
      ),
    }
  })
}

const e2eReportsDir = path.join(inputRoot, "e2e-main")
function readE2eReports(directory) {
  const reportPaths = fs
    .readdirSync(directory, { recursive: true })
    .filter((file) => /shard-\d+\.json$/u.test(file))
    .map((file) => path.join(directory, file))
  const reports = reportPaths.map((file) => ({
    shard: Number(path.basename(file).match(/shard-(\d+)/u)[1]),
    report: JSON.parse(fs.readFileSync(file, "utf8")),
  }))
  assert.deepEqual(
    reports.map(({ shard }) => shard).sort(),
    [1, 2, 3, 4, 5, 6],
    "Expected six unique E2E reports",
  )
  return reports
}
const reports = readE2eReports(e2eReportsDir)

function e2eCases(report) {
  const cases = []
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        cases.push({
          key: `${spec.id}:${test.projectName}:${test.repeatEachIndex ?? 0}`,
          file: spec.file.startsWith("e2e/")
            ? spec.file
            : path.posix.join("e2e", spec.file),
          project: test.projectName,
          duration: test.results?.at(-1)?.duration ?? 0,
        })
      }
    }
    for (const child of suite.suites ?? []) walk(child)
  }
  for (const suite of report.suites ?? []) walk(suite)
  return cases
}
const e2eCaseWork = (report) =>
  e2eCases(report).reduce((total, test) => total + test.duration, 0)

const manifestPath = path.join(path.dirname(outputPath), "e2e-manifest.json")
execFileSync(
  process.execPath,
  [
    path.join(rootDir, "scripts/write-e2e-spec-durations.mjs"),
    e2eReportsDir,
    manifestPath,
  ],
  { stdio: "pipe" },
)
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
const specs = await listShardableSpecs(rootDir)
const planned = await Promise.all(
  Array.from({ length: 6 }, (_, index) =>
    planSpecShard({
      cwd: rootDir,
      index: index + 1,
      total: 6,
      durationsPath: manifestPath,
    }),
  ),
)
assert.ok(
  planned.every(Array.isArray),
  "Planner fell back despite captured manifest",
)
assert.equal(
  planned.flat().length,
  specs.length,
  "Plan omitted or duplicated specs",
)
assert.equal(
  new Set(planned.flat()).size,
  specs.length,
  "Plan duplicated specs",
)
assert.deepEqual(
  planned.flat().sort(),
  specs,
  "Plan and smoke inventory differ",
)

let warmReplay
const warmReportsDirectory = path.join(inputRoot, "e2e-warm-reports")
if (fs.existsSync(warmReportsDirectory)) {
  const warmReports = readE2eReports(warmReportsDirectory)
  const inventory = (reports) =>
    reports
      .flatMap(({ report }) => e2eCases(report))
      .filter((test) => test.project === "chromium")
  const baselineCases = inventory(reports)
  const warmCases = inventory(warmReports)
  for (const cases of [baselineCases, warmCases])
    assert.equal(
      new Set(cases.map((test) => test.key)).size,
      cases.length,
      "An E2E case ran on multiple shards",
    )
  assert.deepEqual(
    warmCases.map((test) => test.key).sort(),
    baselineCases.map((test) => test.key).sort(),
    "Warm cache changed the collected E2E cases",
  )
  for (const { shard, report } of warmReports) {
    const files = [
      ...new Set(
        e2eCases(report)
          .filter((test) => test.project === "chromium")
          .map((test) => test.file),
      ),
    ].sort()
    assert.deepEqual(
      files,
      [...planned[shard - 1]].sort(),
      `Warm shard ${shard} did not execute the cached plan`,
    )
  }
  warmReplay = {
    chromiumCases: warmCases.length,
    sameCases: true,
    cachedPlanMatchesActualFiles: true,
    shards: warmReports
      .sort((a, b) => a.shard - b.shard)
      .map(({ shard, report }) => ({
        shard,
        ...report.stats,
        lastAttemptCaseSeconds: seconds(e2eCaseWork(report)),
      })),
  }
}

const summary = {
  unit: {
    fileCounts: Object.fromEntries(
      Object.entries(runs).map(([name, files]) => [name, files.length]),
    ),
    sameMainAndPrMembership: true,
    cachedWeightsReproducePr: true,
    shards: Object.fromEntries(
      Object.entries(runs).map(([name, files]) => [name, unitSummary(files)]),
    ),
    comparisons,
  },
  e2e: {
    files: specs.length,
    manifestFiles: Object.keys(manifest.durations).length,
    unknown: specs.filter((file) => manifest.durations[file] === undefined),
    capturedShards: reports
      .sort((a, b) => a.shard - b.shard)
      .map(({ shard, report }) => ({
        shard,
        ...report.stats,
        lastAttemptCaseSeconds: seconds(e2eCaseWork(report)),
      })),
    plannedShards: planned.map((files, index) => ({
      shard: index + 1,
      files: files.length,
      measuredCaseSeconds: seconds(
        files.reduce((sum, file) => sum + (manifest.durations[file] ?? 0), 0),
      ),
    })),
    warmReplay,
  },
}
fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2) + "\n")
console.log(
  JSON.stringify(
    {
      unitFiles: summary.unit.fileCounts,
      sameUnitMembership: true,
      cachedWeightsReproducePr: true,
      e2eFiles: specs.length,
      e2eManifestFiles: summary.e2e.manifestFiles,
      e2eUnknown: summary.e2e.unknown.length,
      warmChromiumCases: warmReplay?.chromiumCases,
      warmCachePlanVerified: warmReplay?.cachedPlanMatchesActualFiles,
      e2ePlannedCaseSeconds: summary.e2e.plannedShards.map(
        (shard) => shard.measuredCaseSeconds,
      ),
      output: path.relative(rootDir, outputPath),
    },
    null,
    2,
  ),
)
