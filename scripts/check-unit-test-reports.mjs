#!/usr/bin/env node
import { appendFileSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { parseArgs } from "node:util"

import { getVitestBlobCoverage, parseVitestBlob } from "./utils/vitestBlob.mjs"
import {
  extractFileTimings,
  writeUnitTestDurationsFromReports,
} from "./write-unit-test-durations.mjs"

/** Match files across runner roots while keeping distinct Vitest projects separate. */
function fileIdentity(name, projectName = "") {
  if (
    typeof name !== "string" ||
    name.length === 0 ||
    typeof projectName !== "string"
  ) {
    throw new Error("Invalid test file identity")
  }
  const relative = path.relative(
    process.cwd(),
    path.resolve(name.replaceAll("\\", "/")),
  )
  return JSON.stringify([projectName, relative.split(path.sep).join("/")])
}

// Test failures are valid input. Missing or unusable shard coverage is not.
let total
let complete = false
try {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      "durations-output": { type: "string" },
      "expected-files": { type: "string" },
    },
  })
  const [
    directory = ".vitest/blob",
    totalValue = process.env.UNIT_TEST_SHARD_TOTAL,
  ] = positionals
  total = Number(totalValue)
  const durationsOutput = values["durations-output"]
  if (!Number.isInteger(total) || total < 1) {
    throw new Error("Expected a positive integer shard total")
  }
  const names = readdirSync(directory).filter((name) => name.endsWith(".json"))
  const versions = new Set()
  const reports = []
  const testFiles = new Map()
  for (let shard = 1; shard <= total; shard++) {
    const name = `blob-${shard}-${total}.json`
    if (!names.includes(name)) throw new Error(`Missing shard report: ${name}`)
    const blob = parseVitestBlob(
      readFileSync(path.join(directory, name), "utf8"),
    )
    const coverage = getVitestBlobCoverage(blob)
    if (
      !Array.isArray(blob) ||
      typeof blob[0] !== "string" ||
      !Array.isArray(blob[1]) ||
      blob[1].length === 0 ||
      !Array.isArray(blob[2]) ||
      blob[2].length !== 0 ||
      !coverage ||
      typeof coverage !== "object" ||
      Array.isArray(coverage) ||
      Object.keys(coverage).length === 0
    ) {
      throw new Error(`Unusable test or coverage data: ${name}`)
    }
    for (const file of blob[1]) {
      const identity = fileIdentity(file.name, file.projectName)
      if (testFiles.has(identity)) {
        throw new Error(
          `Duplicate test file ${identity} in ${testFiles.get(identity)} and ${name}`,
        )
      }
      testFiles.set(identity, name)
    }
    versions.add(blob[0])
    if (durationsOutput !== undefined) {
      reports.push({ shard, files: extractFileTimings(blob) })
    }
  }
  if (names.length !== total || versions.size !== 1) {
    throw new Error("Unexpected shard reports or mixed Vitest versions")
  }
  if (values["expected-files"] !== undefined) {
    const inventory = JSON.parse(readFileSync(values["expected-files"], "utf8"))
    if (!Array.isArray(inventory) || inventory.length === 0) {
      throw new Error("Expected a nonempty test file inventory")
    }
    const expected = new Set()
    for (const file of inventory) {
      const identity = fileIdentity(file?.file, file?.projectName)
      if (expected.has(identity))
        throw new Error(`Duplicate expected test file ${identity}`)
      expected.add(identity)
    }
    const missing = [...expected].filter((identity) => !testFiles.has(identity))
    const unexpected = [...testFiles.keys()].filter(
      (identity) => !expected.has(identity),
    )
    if (missing.length > 0)
      throw new Error(
        `Missing test files (${missing.length}): ${missing.slice(0, 10).join(", ")}`,
      )
    if (unexpected.length > 0)
      throw new Error(
        `Unexpected test files (${unexpected.length}): ${unexpected.slice(0, 10).join(", ")}`,
      )
  }
  complete = true
  console.log(`All ${total} shard reports contain test and coverage data.`)
  if (durationsOutput !== undefined) {
    writeUnitTestDurationsFromReports(reports, path.resolve(durationsOutput))
  }
} catch (error) {
  console.error(
    `${complete ? "Could not publish unit test durations" : "Incomplete coverage"}: ${error.message}`,
  )
  process.exitCode = 1
} finally {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `complete=${complete}\n`)
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      complete
        ? `All ${total} shard reports are present. Coverage includes executed code even when tests fail.\n`
        : "Incomplete shard coverage: Codecov coverage upload is blocked. Available reports remain in workflow artifacts for diagnosis.\n",
    )
  }
}
