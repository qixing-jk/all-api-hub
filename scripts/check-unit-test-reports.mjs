#!/usr/bin/env node
import { appendFileSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { parseArgs } from "node:util"

import { parseVitestBlob } from "./utils/vitestBlob.mjs"
import {
  extractFileTimings,
  writeUnitTestDurationsFromReports,
} from "./write-unit-test-durations.mjs"

// Test failures are valid input. Missing or unusable shard coverage is not.
let total
let complete = false
try {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      "durations-output": { type: "string" },
    },
  })
  const [
    directory = ".vitest-reports",
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
  for (let shard = 1; shard <= total; shard++) {
    const name = `blob-${shard}-${total}.json`
    if (!names.includes(name)) throw new Error(`Missing shard report: ${name}`)
    const blob = parseVitestBlob(
      readFileSync(path.join(directory, name), "utf8"),
    )
    if (
      !Array.isArray(blob) ||
      typeof blob[0] !== "string" ||
      !Array.isArray(blob[1]) ||
      blob[1].length === 0 ||
      !Array.isArray(blob[2]) ||
      blob[2].length !== 0 ||
      !blob[4] ||
      typeof blob[4] !== "object" ||
      Array.isArray(blob[4]) ||
      Object.keys(blob[4]).length === 0
    ) {
      throw new Error(`Unusable test or coverage data: ${name}`)
    }
    versions.add(blob[0])
    if (durationsOutput !== undefined) {
      reports.push({ shard, files: extractFileTimings(blob) })
    }
  }
  if (names.length !== total || versions.size !== 1) {
    throw new Error("Unexpected shard reports or mixed Vitest versions")
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
