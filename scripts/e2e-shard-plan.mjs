#!/usr/bin/env node
/**
 * Prints the spec files one E2E shard should run, packed by measured duration.
 *
 * Playwright's `--shard` slices by test count, so the shard that receives the heaviest
 * specs runs far longer than the rest. CI restores the per-spec timings published by
 * `scripts/write-e2e-spec-durations.mjs` and passes each job its share instead; when no
 * manifest is available the caller falls back to `--shard`, as in the unit-test
 * sequencer.
 *
 * Usage: node scripts/e2e-shard-plan.mjs --index 1 --total 6 [--durations <file>]
 */
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"

import { planSpecShard } from "../e2e/utils/e2eShardPlan.shared.js"

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

const { values } = parseArgs({
  options: {
    index: { type: "string" },
    total: { type: "string" },
    durations: { type: "string" },
  },
})

const index = Number(values.index)
const total = Number(values.total)
if (!Number.isInteger(index) || !Number.isInteger(total)) {
  console.error(
    "Usage: node scripts/e2e-shard-plan.mjs --index <n> --total <n>",
  )
  process.exit(2)
}

const specs = await planSpecShard({
  cwd: rootDir,
  index,
  total,
  ...(values.durations ? { durationsPath: values.durations } : {}),
})

if (!specs) {
  console.error(
    "No usable E2E spec durations manifest; falling back to --shard. Run the E2E workflow on the base branch to publish one.",
  )
  process.exit(0)
}

console.log(specs.join("\n"))
