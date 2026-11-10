import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { stringify } from "flatted"

import { bashPath, workflowCommand } from "./workflowCommand.mjs"

const script = fileURLToPath(
  new URL("../../scripts/check-unit-test-reports.mjs", import.meta.url),
)

function reportGuardCommand() {
  const command = workflowCommand("test.yml", "Check shard report completeness")
  const quotedScript =
    "'" + script.replaceAll("\\", "/").replaceAll("'", "'\"'\"'") + "'"
  return command.replaceAll("scripts/check-unit-test-reports.mjs", quotedScript)
}

/**
 * Run the report guard against isolated blob fixtures, directly or through its CI command.
 * Expose the process result and published outputs so failed-test coverage can be
 * distinguished from incomplete reports that must not publish coverage or timings.
 */
function check(context, reports, total = "2", options = {}) {
  const directory = mkdtempSync(join(tmpdir(), "unit-test-reports-"))
  context.after(() => {
    assert.ok(directory.startsWith(join(tmpdir(), "unit-test-reports-")))
    rmSync(directory, { recursive: true, force: true })
  })
  const reportsDirectory = options.workflowEvent
    ? join(directory, ".vitest/blob")
    : directory
  mkdirSync(reportsDirectory, { recursive: true })
  for (const [name, blob] of Object.entries(reports)) {
    writeFileSync(
      join(reportsDirectory, name),
      options.rawReports ? blob : stringify(blob),
    )
  }
  const output = join(directory, "output")
  const durationsPath = options.outputIsDirectory
    ? directory
    : join(
        directory,
        options.workflowEvent ? ".vitest-durations" : "durations",
        "shard-durations.json",
      )
  const args = [script, directory, total]
  if (options.publishDurations) args.push("--durations-output", durationsPath)
  const command = options.workflowEvent ? bashPath() : process.execPath
  const commandArgs = options.workflowEvent
    ? [
        "--noprofile",
        "--norc",
        "-e",
        "-o",
        "pipefail",
        "-c",
        reportGuardCommand(),
      ]
    : args
  const result = spawnSync(command, commandArgs, {
    cwd: directory,
    encoding: "utf8",
    env: {
      ...process.env,
      ...(options.workflowEvent
        ? { GITHUB_EVENT_NAME: options.workflowEvent }
        : {}),
      UNIT_TEST_SHARD_TOTAL: total,
      GITHUB_OUTPUT: output,
      GITHUB_STEP_SUMMARY: join(directory, "summary"),
    },
  })
  return {
    ...result,
    output: () => readFileSync(output, "utf8"),
    durations: () => JSON.parse(readFileSync(durationsPath, "utf8")),
    hasDurations: () => existsSync(durationsPath),
  }
}

const blob = (state = "pass") => [
  "4.0.3",
  [{ name: "example.test.ts", result: { state } }],
  [],
  [],
  { "src/example.ts": { s: { 0: 1 } } },
  100,
]

const currentBlob = (state = "pass") => [
  "4.1.12",
  [{ name: "example.test.ts", result: { state, duration: 25 } }],
  [],
  { "src/example.ts": { s: { 0: 1 } } },
  100,
  [],
]

test("complete reports remain usable when an assertion failed", (context) => {
  const result = check(context, {
    "blob-1-2.json": blob("fail"),
    "blob-2-2.json": blob(),
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.output(), "complete=true\n")
})

test("Vitest 4.1 reports retain failed-test coverage and publish timings", (context) => {
  const result = check(
    context,
    {
      "blob-1-2.json": currentBlob("fail"),
      "blob-2-2.json": currentBlob("pass"),
    },
    "2",
    { publishDurations: true },
  )
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.output(), "complete=true\n")
  assert.deepEqual(result.durations().durations, { "example.test.ts": 50 })
})

test("Vitest 5 reports retain failed-test coverage and publish timings", (context) => {
  const first = currentBlob("fail")
  const second = currentBlob()
  first[0] = second[0] = "5.1.0"
  const result = check(
    context,
    {
      "blob-1-2.json": first,
      "blob-2-2.json": second,
    },
    "2",
    { publishDurations: true },
  )
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.output(), "complete=true\n")
  assert.deepEqual(result.durations().durations, { "example.test.ts": 50 })
})

for (const [name, corrupt] of Object.entries({
  "missing coverage": (report) => {
    report[3] = null
  },
  "empty coverage": (report) => {
    report[3] = {}
  },
  "array coverage": (report) => {
    report[3] = []
  },
  "empty tests": (report) => {
    report[1] = []
  },
  "worker error": (report) => {
    report[2] = [{ message: "Worker stopped" }]
  },
  "mixed versions": (report) => {
    report[0] = "4.1.11"
  },
  "unsupported version": (report) => {
    report[0] = "6.0.0"
  },
})) {
  test(`Vitest 4.1 ${name} blocks coverage and timing publication`, (context) => {
    const second = currentBlob()
    corrupt(second)
    const result = check(
      context,
      { "blob-1-2.json": currentBlob(), "blob-2-2.json": second },
      "2",
      { publishDurations: true },
    )
    assert.equal(result.status, 1)
    assert.equal(result.output(), "complete=false\n")
    assert.equal(result.hasDurations(), false)
  })
}

test("complete reports can also publish balanced file durations", (context) => {
  const first = blob()
  first[1] = [
    {
      name: "tests/a.test.ts",
      result: { duration: 6 },
      setupDuration: 2,
      prepareDuration: 1,
      collectDuration: 2,
      environmentLoad: 1,
    },
    { name: "tests/b.test.ts", result: { duration: 8 } },
  ]
  const second = blob("fail")
  second[1] = [
    {
      name: "tests/c.test.ts",
      result: { state: "fail", duration: 5 },
      collectDuration: 5,
    },
  ]
  const result = check(
    context,
    { "blob-1-2.json": first, "blob-2-2.json": second },
    "2",
    { publishDurations: true },
  )
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.output(), "complete=true\n")
  const manifest = result.durations()
  assert.equal(manifest.version, 1)
  assert.deepEqual(manifest.durations, {
    "tests/a.test.ts": 9,
    "tests/b.test.ts": 6,
    "tests/c.test.ts": 15,
  })
  assert.match(manifest.generatedAt, /^\d{4}-\d{2}-\d{2}T/)
})

test("timing write failures retain complete coverage but fail the command", (context) => {
  const first = blob()
  first[1][0].result.duration = 100
  const second = blob("fail")
  second[1][0].result.duration = 100
  const result = check(
    context,
    { "blob-1-2.json": first, "blob-2-2.json": second },
    "2",
    { publishDurations: true, outputIsDirectory: true },
  )
  assert.equal(result.status, 1)
  assert.equal(result.output(), "complete=true\n")
  assert.match(result.stderr, /Could not publish unit test durations/)
  assert.doesNotMatch(result.stderr, /Incomplete coverage/)
})

for (const event of ["push", "workflow_dispatch"]) {
  test(`${event} report workflow publishes timings from the completeness command`, (context) => {
    const first = blob()
    first[1][0].result.duration = 100
    const second = blob("fail")
    second[1][0].result.duration = 100
    const result = check(
      context,
      { "blob-1-2.json": first, "blob-2-2.json": second },
      "2",
      { workflowEvent: event },
    )
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.equal(result.output(), "complete=true\n")
    assert.equal(result.hasDurations(), true)
    assert.deepEqual(result.durations().durations, { "example.test.ts": 200 })
  })
}

test("pull request report workflow checks coverage without publishing timings", (context) => {
  const result = check(
    context,
    { "blob-1-2.json": blob("fail"), "blob-2-2.json": blob() },
    "2",
    { workflowEvent: "pull_request" },
  )
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.equal(result.output(), "complete=true\n")
  assert.equal(result.hasDurations(), false)
})

for (const [name, reports] of Object.entries({
  "missing shard": { "blob-1-2.json": blob() },
  "missing coverage": {
    "blob-1-2.json": blob(),
    "blob-2-2.json": [...blob().slice(0, 4), null, 100],
  },
  "empty test run": {
    "blob-1-2.json": blob(),
    "blob-2-2.json": ["4.0.3", [], [], [], {}, 100],
  },
  "mixed versions": {
    "blob-1-2.json": blob(),
    "blob-2-2.json": ["5.0.0", ...blob().slice(1)],
  },
  "unexpected shard": {
    "blob-1-2.json": blob(),
    "blob-2-2.json": blob(),
    "blob-1-3.json": blob(),
  },
  "malformed blob": {
    "blob-1-2.json": blob(),
    "blob-2-2.json": {},
  },
  "worker error": {
    "blob-1-2.json": blob(),
    "blob-2-2.json": [
      "4.0.3",
      blob()[1],
      [{ message: "Worker exited" }],
      ...blob().slice(3),
    ],
  },
})) {
  test(`${name} blocks publication as complete coverage`, (context) => {
    const result = check(context, reports, "2", { publishDurations: true })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /Incomplete coverage/)
    assert.equal(result.output(), "complete=false\n")
    assert.equal(result.hasDurations(), false)
  })
}

for (const corrupt of ["null reference", "dangling reference"]) {
  test(`${corrupt} in coverage blocks publication and timing output`, (context) => {
    const encoded = JSON.parse(stringify(blob()))
    encoded[0][4] = String(
      encoded.length + (corrupt === "dangling reference" ? 1 : 0),
    )
    if (corrupt === "null reference") encoded.push(null)
    const result = check(
      context,
      {
        "blob-1-2.json": stringify(blob()),
        "blob-2-2.json": JSON.stringify(encoded),
      },
      "2",
      { publishDurations: true, rawReports: true },
    )
    assert.equal(result.status, 1)
    assert.equal(result.output(), "complete=false\n")
    assert.equal(result.hasDurations(), false)
  })
}

test("workflow uploads complete coverage after failed tests without hiding failure", () => {
  const workflow = readFileSync(
    new URL("../../.github/workflows/test.yml", import.meta.url),
    "utf8",
  )
  const step = (name) =>
    workflow
      .replaceAll("\r\n", "\n")
      .split(`      - name: ${name}\n`)[1]
      ?.split(/\n {6}- /)[0]
  assert.match(
    step("Upload coverage to Codecov"),
    /if:.*!cancelled\(\).*steps\.reports\.outputs\.complete == 'true'.*hashFiles\('coverage\/lcov.info'\) != ''/,
  )
  assert.match(step("Check shard report completeness"), /id: reports/)
  assert.match(step("Merge test and coverage reports"), /if:.*!cancelled\(\)/)
  assert.doesNotMatch(
    step("Merge test and coverage reports"),
    /continue-on-error/,
  )
  assert.match(
    step("Upload test results to Codecov"),
    /hashFiles\('test-report.junit.xml'\) != ''/,
  )
})

test("real failed Vitest shards merge into coverage and JUnit while retaining failure", (context) => {
  const scratch = fileURLToPath(new URL("../../.scratch/", import.meta.url))
  mkdirSync(scratch, { recursive: true })
  const directory = mkdtempSync(join(scratch, "coverage-ci-"))
  context.after(() => {
    assert.ok(directory.startsWith(join(scratch, "coverage-ci-")))
    rmSync(directory, { recursive: true, force: true })
  })
  mkdirSync(join(directory, "src"))
  mkdirSync(join(directory, "tests"))
  writeFileSync(
    join(directory, "src/math.js"),
    "export const add = (a, b) => a + b\n",
  )
  for (const [name, expected] of [
    ["pass", 3],
    ["fail", 4],
  ]) {
    writeFileSync(
      join(directory, `tests/${name}.test.js`),
      `import { add } from '../src/math.js'\ntest('${name}', () => expect(add(1, 2)).toBe(${expected}))\n`,
    )
  }
  writeFileSync(
    join(directory, "vitest.config.mjs"),
    `export default {
    test: {
      globals: true,
      coverage: { provider: 'v8', include: ['src/**/*.js'], reporter: ['lcov', 'json'] }
    }
  }`,
  )
  const vitest = fileURLToPath(
    new URL("../../node_modules/vitest/vitest.mjs", import.meta.url),
  )
  const run = (args) =>
    spawnSync(process.execPath, [vitest, ...args], {
      cwd: directory,
      encoding: "utf8",
      timeout: 60_000,
    })
  const statuses = []
  const diagnostics = []
  for (let shard = 1; shard <= 2; shard++) {
    const result = run([
      "run",
      "--coverage",
      "--reporter=blob",
      `--shard=${shard}/2`,
    ])
    assert.ok(result.status === 0 || result.status === 1, result.stderr)
    statuses.push(result.status)
    diagnostics.push(result.stdout + result.stderr)
  }
  assert.deepEqual(statuses.sort(), [0, 1], diagnostics.join("\n"))
  const gate = spawnSync(
    process.execPath,
    [script, join(directory, ".vitest/blob"), "2"],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        GITHUB_OUTPUT: join(directory, "output"),
        GITHUB_STEP_SUMMARY: join(directory, "summary"),
      },
    },
  )
  assert.equal(gate.status, 0, gate.stderr)
  const merged = run([
    "--merge-reports=.vitest/blob",
    "--coverage",
    "--reporter=junit",
    "--outputFile.junit=test-report.junit.xml",
  ])
  assert.equal(merged.status, 1, merged.stdout + merged.stderr)
  assert.match(
    readFileSync(join(directory, "coverage/lcov.info"), "utf8"),
    /DA:1,[1-9]/,
  )
  assert.match(
    readFileSync(join(directory, "test-report.junit.xml"), "utf8"),
    /failures="1"/,
  )
})
