import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import {
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

const script = fileURLToPath(
  new URL("../../scripts/check-unit-test-reports.mjs", import.meta.url),
)

function check(context, reports, total = "2") {
  const directory = mkdtempSync(join(tmpdir(), "unit-test-reports-"))
  context.after(() => {
    assert.ok(directory.startsWith(join(tmpdir(), "unit-test-reports-")))
    rmSync(directory, { recursive: true, force: true })
  })
  for (const [name, blob] of Object.entries(reports)) {
    writeFileSync(join(directory, name), stringify(blob))
  }
  const output = join(directory, "output")
  const result = spawnSync(process.execPath, [script, directory, total], {
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_OUTPUT: output,
      GITHUB_STEP_SUMMARY: join(directory, "summary"),
    },
  })
  return { ...result, output: () => readFileSync(output, "utf8") }
}

const blob = (state = "pass") => [
  "4.0.3",
  [{ name: "example.test.ts", result: { state } }],
  [],
  [],
  { "src/example.ts": { s: { 0: 1 } } },
  100,
]

test("complete reports remain usable when an assertion failed", (context) => {
  const result = check(context, {
    "blob-1-2.json": blob("fail"),
    "blob-2-2.json": blob(),
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.output(), "complete=true\n")
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
    const result = check(context, reports)
    assert.equal(result.status, 1)
    assert.match(result.stderr, /Incomplete coverage/)
    assert.equal(result.output(), "complete=false\n")
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
  for (let shard = 1; shard <= 2; shard++) {
    const result = run([
      "run",
      "--coverage",
      "--reporter=blob",
      `--shard=${shard}/2`,
    ])
    assert.ok(result.status === 0 || result.status === 1, result.stderr)
    statuses.push(result.status)
  }
  assert.deepEqual(statuses.sort(), [0, 1])
  const gate = spawnSync(
    process.execPath,
    [script, join(directory, ".vitest-reports"), "2"],
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
    "--merge-reports=.vitest-reports",
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
