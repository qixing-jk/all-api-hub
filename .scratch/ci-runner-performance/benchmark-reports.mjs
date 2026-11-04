#!/usr/bin/env node
/** Compare the old two-command pipeline with the combined public CLI. */
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { parse } from "flatted"

import { parseVitestBlob } from "../../scripts/utils/vitestBlob.mjs"

const directory = path.dirname(fileURLToPath(import.meta.url))
const repository = path.resolve(directory, "../..")
const { values } = parseArgs({
  options: {
    "reports-dir": { type: "string" },
    "baseline-dir": { type: "string" },
    rounds: { type: "string", default: "3" },
    label: { type: "string", default: "combined" },
  },
})
assert.ok(values["reports-dir"], "Pass --reports-dir with six captured blobs")
const reportsDirectory = path.resolve(values["reports-dir"])
const baselineDirectory = path.resolve(
  values["baseline-dir"] ?? path.join(directory, "artifacts/baseline"),
)
const rounds = Number(values.rounds)
assert.ok(Number.isInteger(rounds) && rounds > 0, "Expected positive rounds")
const artifacts = path.join(directory, "artifacts")
fs.mkdirSync(artifacts, { recursive: true })
const outputDirectory = fs.mkdtempSync(
  path.join(artifacts, "report-benchmark-"),
)
const digest = (file) =>
  createHash("sha256").update(fs.readFileSync(file)).digest("hex")
const sourceFiles = [
  "scripts/check-unit-test-reports.mjs",
  "scripts/write-unit-test-durations.mjs",
  "scripts/utils/unitTestDurations.mjs",
  "scripts/utils/vitestBlob.mjs",
]
const sources = (root) =>
  Object.fromEntries(
    sourceFiles.map((file) => [
      file,
      fs.existsSync(path.join(root, file))
        ? digest(path.join(root, file))
        : null,
    ]),
  )
const reportFiles = fs
  .readdirSync(reportsDirectory)
  .filter((file) => file.endsWith(".json"))
assert.deepEqual(
  reportFiles.sort(),
  Array.from({ length: 6 }, (_, index) => `blob-${index + 1}-6.json`),
)
const metadata = {
  generatedAt: new Date().toISOString(),
  label: values.label,
  node: process.version,
  platform: process.platform,
  cpu: [...new Set(os.cpus().map(({ model }) => model))],
  reports: reportFiles.map((file) => ({
    file,
    bytes: fs.statSync(path.join(reportsDirectory, file)).size,
    sha256: digest(path.join(reportsDirectory, file)),
  })),
  sources: {
    baseline: sources(baselineDirectory),
    candidate: sources(repository),
  },
}

function verifyDecoding(file) {
  const text = fs.readFileSync(path.join(reportsDirectory, file), "utf8")
  assert.deepEqual(
    parseVitestBlob(text),
    parse(text),
    `Decoded blob changed: ${file}`,
  )
}
for (const file of reportFiles) {
  verifyDecoding(file)
  console.log(`Verified every decoded field and reference in ${file}`)
}
global.gc?.()

function execute(label, root, relativeScript, args, outputFile) {
  const started = process.hrtime.bigint()
  const result = spawnSync(
    process.execPath,
    [path.join(root, relativeScript), ...args],
    {
      cwd: repository,
      encoding: "utf8",
      env: {
        ...process.env,
        GITHUB_OUTPUT: outputFile,
        GITHUB_STEP_SUMMARY: "",
      },
      maxBuffer: 1024 * 1024,
    },
  )
  const seconds = Number(process.hrtime.bigint() - started) / 1e9
  assert.equal(
    result.status,
    0,
    `${label}: ${result.error ?? ""}\n${result.stdout}\n${result.stderr}`,
  )
  console.log(`${label}: ${seconds.toFixed(3)}s`)
  return { seconds, stdout: result.stdout, stderr: result.stderr }
}

const samples = []
let expected
for (let round = 1; round <= rounds; round++) {
  const order =
    round % 2 ? ["baseline", "candidate"] : ["candidate", "baseline"]
  const sample = { round, order }
  for (const variant of order) {
    const manifest = path.join(outputDirectory, `${variant}-${round}.json`)
    const outputFile = path.join(outputDirectory, `${variant}-${round}.output`)
    const phases =
      variant === "baseline"
        ? [
            execute(
              `${round} baseline guard`,
              baselineDirectory,
              "scripts/check-unit-test-reports.mjs",
              [reportsDirectory, "6"],
              outputFile,
            ),
            execute(
              `${round} baseline durations`,
              baselineDirectory,
              "scripts/write-unit-test-durations.mjs",
              [reportsDirectory, manifest],
              outputFile,
            ),
          ]
        : [
            execute(
              `${round} candidate combined`,
              repository,
              "scripts/check-unit-test-reports.mjs",
              [reportsDirectory, "6", "--durations-output", manifest],
              outputFile,
            ),
          ]
    assert.equal(fs.readFileSync(outputFile, "utf8"), "complete=true\n")
    const { generatedAt, ...content } = JSON.parse(
      fs.readFileSync(manifest, "utf8"),
    )
    assert.ok(generatedAt)
    expected ??= content
    assert.deepEqual(
      content,
      expected,
      "File weights changed between the old and combined CLI",
    )
    sample[variant] = {
      phases,
      seconds: phases.reduce((total, phase) => total + phase.seconds, 0),
    }
  }
  samples.push(sample)
}
const median = (numbers) => {
  const sorted = [...numbers].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2
}
const baselineSeconds = median(samples.map((sample) => sample.baseline.seconds))
const candidateSeconds = median(
  samples.map((sample) => sample.candidate.seconds),
)
const summary = {
  rounds,
  verifiedDecodedReports: reportFiles.length,
  verifiedFiles: Object.keys(expected.durations).length,
  baselineMedianSeconds: baselineSeconds,
  candidateMedianSeconds: candidateSeconds,
  savedSeconds: baselineSeconds - candidateSeconds,
  savedPercent: (1 - candidateSeconds / baselineSeconds) * 100,
}
const result = { metadata, samples, summary }
const resultPath = path.join(outputDirectory, "result.json")
fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`)
console.log(JSON.stringify(summary, null, 2))
console.log(`Evidence: ${resultPath}`)
