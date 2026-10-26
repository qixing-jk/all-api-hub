#!/usr/bin/env node
import { appendFileSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { parse } from "flatted"

// Test failures are valid input. Missing or unusable shard coverage is not.
const [
  directory = ".vitest-reports",
  totalValue = process.env.UNIT_TEST_SHARD_TOTAL,
] = process.argv.slice(2)
const total = Number(totalValue)
let complete = false
try {
  if (!Number.isInteger(total) || total < 1) {
    throw new Error("Expected a positive integer shard total")
  }
  const names = readdirSync(directory).filter((name) => name.endsWith(".json"))
  const versions = new Set()
  for (let shard = 1; shard <= total; shard++) {
    const name = `blob-${shard}-${total}.json`
    if (!names.includes(name)) throw new Error(`Missing shard report: ${name}`)
    const blob = parse(readFileSync(path.join(directory, name), "utf8"))
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
  }
  if (names.length !== total || versions.size !== 1) {
    throw new Error("Unexpected shard reports or mixed Vitest versions")
  }
  complete = true
  console.log(`All ${total} shard reports contain test and coverage data.`)
} catch (error) {
  console.error(`Incomplete coverage: ${error.message}`)
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
