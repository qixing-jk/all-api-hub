import assert from "node:assert/strict"
import { execFileSync, spawn, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"
import { runInNewContext } from "node:vm"
import { stringify } from "flatted"

import { listShardableSpecs } from "../../e2e/utils/e2eShardPlan.shared.js"
import { bashPath, workflowCommand } from "./workflowCommand.mjs"

const root = fileURLToPath(new URL("../../", import.meta.url))
const replay = path.join(root, ".scratch/ci-runner-performance/replay.mjs")
const specs = await listShardableSpecs(root)

function temporaryDirectory(context) {
  const directory = mkdtempSync(path.join(tmpdir(), "aah-ci-performance-"))
  context.after(() => {
    assert.ok(directory.startsWith(path.join(tmpdir(), "aah-ci-performance-")))
    rmSync(directory, { recursive: true, force: true })
  })
  return directory
}

test("Playwright serializes a reused profile across files even with a worker override", (context) => {
  const directory = temporaryDirectory(context)
  const configPath = path.join(directory, "playwright.config.mts")
  writeFileSync(
    configPath,
    `import config from ${JSON.stringify(path.join(root, "playwright.config.ts").replaceAll("\\", "/"))}
    export default { ...config, testDir: ${JSON.stringify(directory)}, testIgnore: [],
      reporter: [['json']], outputDir: ${JSON.stringify(path.join(directory, "output"))},
      projects: config.projects.filter(p => p.name === 'chromium').map(p => ({ ...p, dependencies: [] })) }
    `,
  )
  for (const file of ["first", "second"]) {
    writeFileSync(
      path.join(directory, `${file}.spec.ts`),
      `import { test } from ${JSON.stringify(path.join(root, "node_modules/@playwright/test/index.mjs").replaceAll("\\", "/"))}
      import fs from 'node:fs'
      test('owns the reused profile exclusively', async () => {
        const lock = process.env.AAH_E2E_USER_DATA_DIR + '.lock'
        const handle = fs.openSync(lock, 'wx')
        try { await new Promise(resolve => setTimeout(resolve, 300)) }
        finally { fs.closeSync(handle); fs.unlinkSync(lock) }
      })`,
    )
  }
  const result = spawnSync(
    process.execPath,
    [
      path.join(root, "node_modules/@playwright/test/cli.js"),
      "test",
      `--config=${configPath}`,
      "--workers=4",
    ],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        CI: "",
        AAH_E2E_USER_DATA_DIR: path.join(directory, "profile"),
        AAH_E2E_WORKERS: "4",
      },
    },
  )
  assert.equal(result.status, 0, result.stdout + result.stderr)
  const report = JSON.parse(result.stdout)
  assert.equal(report.stats.expected, 2)
  const workerIndexes = report.suites.flatMap((suite) =>
    suite.specs.flatMap((spec) =>
      spec.tests.flatMap((test) =>
        test.results.map((result) => result.workerIndex),
      ),
    ),
  )
  assert.equal(new Set(workerIndexes).size, 1)
})

test("unit CI shards and retries retain their file assignments when the latest timing cache changes", (context) => {
  const directory = temporaryDirectory(context)
  mkdirSync(path.join(directory, "tests"))
  const durations = Object.fromEntries(
    Array.from({ length: 18 }, (_, index) => {
      const file = `tests/spec-${index}.test.ts`
      writeFileSync(
        path.join(directory, file),
        "test('runs the selected file', () => {})",
      )
      return [file, (index + 1) * 100]
    }),
  )
  writeFileSync(
    path.join(directory, "vitest.config.mts"),
    `
    import { DurationBalancedSequencer } from ${JSON.stringify(path.join(root, "vitest.shardSequencer.ts").replaceAll("\\", "/"))}
    export default { test: { globals: true, maxWorkers: 1, sequence: { sequencer: DurationBalancedSequencer } } }
  `,
  )
  const snapshot = path.join(directory, "snapshot.json")
  const cache = path.join(directory, "latest.json")
  for (const file of [snapshot, cache])
    writeFileSync(file, JSON.stringify({ version: 1, durations }))
  const workflow = readFileSync(
    path.join(root, ".github/workflows/test.yml"),
    "utf8",
  )
  const restore = workflow
    .split("- name: Restore unit test durations")[1]
    ?.split("- name:")[0]
  assert.ok(restore)
  const producer = workflow
    .split("  unit-test-profile:")[1]
    ?.split("\n  unit-tests:")[0]
  assert.ok(producer?.includes("actions/cache/restore"))
  const publishedName = producer.match(
    /name: (unit-test-shard-duration-profile)/,
  )?.[1]
  assert.ok(publishedName && restore.includes(`name: ${publishedName}`))
  assert.ok(producer.includes("include-hidden-files: true"))
  assert.ok(producer.includes("if-no-files-found: error"))
  assert.ok(producer.includes("inputs.durations_cache_key"))
  const input = restore.includes("actions/download-artifact") ? snapshot : cache
  const list = (index) => {
    const output = path.join(directory, `shard-${index}.json`)
    const result = spawnSync(
      process.execPath,
      [
        path.join(root, "node_modules/vitest/vitest.mjs"),
        "run",
        "--reporter=json",
        `--outputFile=${output}`,
        `--shard=${index}/2`,
      ],
      {
        cwd: directory,
        encoding: "utf8",
        env: { ...process.env, UNIT_TEST_SHARD_DURATIONS: input },
      },
    )
    assert.equal(result.status, 0, result.stdout + result.stderr)
    return JSON.parse(readFileSync(output, "utf8"))
      .testResults.map(({ name }) =>
        path.relative(directory, name).replaceAll("\\", "/"),
      )
      .sort()
  }
  const first = list(1)
  writeFileSync(
    cache,
    JSON.stringify({
      version: 1,
      durations: { ...durations, "tests/spec-0.test.ts": 50_000 },
    }),
  )
  const second = list(2)
  assert.deepEqual(
    [...first, ...second].sort(),
    Object.keys(durations).sort(),
    "Every test file must run exactly once even when the cache changes between shards",
  )
  assert.deepEqual(
    list(1),
    first,
    "A retried shard must retain the original membership",
  )
})

test("unit CI freezes an empty cache without overwriting restored timings", (context) => {
  const directory = temporaryDirectory(context)
  const command = workflowCommand(
    "test.yml",
    "Preserve an empty unit test profile on a cache miss",
  )
  const run = () => {
    const result = spawnSync(bashPath(), ["-e", "-c", command], {
      cwd: directory,
      encoding: "utf8",
    })
    assert.equal(result.status, 0, result.stderr)
  }
  const profile = path.join(directory, ".vitest-durations/shard-durations.json")
  run()
  assert.deepEqual(JSON.parse(readFileSync(profile, "utf8")), {
    version: 1,
    durations: {},
  })
  const original = JSON.stringify({
    version: 1,
    durations: { "tests/a.test.ts": 123 },
  })
  writeFileSync(profile, original)
  run()
  assert.equal(readFileSync(profile, "utf8"), original)
})

/** Run the actual benchmark CLI with a controlled dependency tree and a runner sentinel. */
function benchmarkFixture(context) {
  const directory = temporaryDirectory(context)
  execFileSync("git", ["init", "--quiet", directory])
  execFileSync("git", [
    "-C",
    directory,
    "-c",
    "user.name=Benchmark fixture",
    "-c",
    "user.email=fixture@example.test",
    "-c",
    "commit.gpgsign=false",
    "-c",
    `core.hooksPath=${path.join(directory, "no-hooks")}`,
    "commit",
    "--quiet",
    "--allow-empty",
    "-m",
    "Fixture",
  ])
  const write = (name, contents) => {
    const filename = path.join(directory, name)
    mkdirSync(path.dirname(filename), { recursive: true })
    writeFileSync(filename, contents)
  }
  for (const name of [
    ".scratch/ci-runner-performance/benchmark-test-imports.mjs",
    "scripts/utils/unitTestDurations.mjs",
    "scripts/utils/vitestBlob.mjs",
  ]) {
    write(name, readFileSync(path.join(root, name)))
  }
  write(".gitignore", "node_modules/\n.wxt/\n")
  write(".wxt/tsconfig.json", "{}")
  write("node_modules/vitest/package.json", '{"version":"5.1.0"}')
  write(
    "node_modules/vitest/vitest.mjs",
    'import { writeFileSync } from "node:fs"; writeFileSync("runner-started", ""); process.exit(23)\n',
  )
  cpSync(
    realpathSync(path.join(root, "node_modules/flatted")),
    path.join(directory, "node_modules/flatted"),
    { recursive: true },
  )
  return {
    directory,
    write,
    run: (variants) =>
      spawnSync(
        process.execPath,
        [
          path.join(
            directory,
            ".scratch/ci-runner-performance/benchmark-test-imports.mjs",
          ),
          "--suite=dom",
          `--variants=${variants}`,
          "--rounds=1",
          "--label=prerequisite",
        ],
        { cwd: directory, encoding: "utf8" },
      ),
  }
}

test("Happy DOM benchmarks stop before any run when only the isolated probe has the dependency", (context) => {
  const fixture = benchmarkFixture(context)
  fixture.write(
    ".scratch/dependency-refresh/artifacts/happy-probe/node_modules/happy-dom/package.json",
    '{"main":"index.js"}',
  )
  fixture.write(
    ".scratch/dependency-refresh/artifacts/happy-probe/node_modules/happy-dom/index.js",
    "module.exports = {}",
  )
  const run = fixture.run("baseline,happy-dom")
  assert.notEqual(run.status, 0)
  assert.match(run.stderr, /happy-dom[\s\S]*pnpm add -D happy-dom/)
  assert.equal(
    existsSync(path.join(fixture.directory, "runner-started")),
    false,
  )
  assert.equal(
    existsSync(
      path.join(
        fixture.directory,
        ".scratch/ci-runner-performance/artifacts/imports-prerequisite",
      ),
    ),
    false,
  )
})

for (const variants of ["baseline", "baseline,happy-dom"]) {
  test(`benchmark starts ${variants} with its required dependencies available`, (context) => {
    const fixture = benchmarkFixture(context)
    if (variants.includes("happy-dom")) {
      fixture.write(
        "node_modules/happy-dom/package.json",
        '{"main":"index.js"}',
      )
      fixture.write("node_modules/happy-dom/index.js", "module.exports = {}")
    }
    const run = fixture.run(variants)
    assert.equal(
      existsSync(path.join(fixture.directory, "runner-started")),
      true,
      run.stdout + run.stderr,
    )
  })
}

function fingerprintFixture(context) {
  const directory = temporaryDirectory(context)
  execFileSync("git", ["init", "--quiet", directory])
  writeFileSync(path.join(directory, ".gitignore"), ".wxt/\n")
  const config = path.join(directory, "tsconfig.json")
  writeFileSync(
    config,
    JSON.stringify({
      extends: "./.wxt/tsconfig.json",
      compilerOptions: { target: "ES2022" },
    }),
  )
  const generatedConfig = path.join(directory, ".wxt/tsconfig.json")
  mkdirSync(path.dirname(generatedConfig))
  writeFileSync(
    generatedConfig,
    JSON.stringify({ compilerOptions: { experimentalDecorators: false } }),
  )
  const source = readFileSync(
    path.join(
      root,
      ".scratch/ci-runner-performance/benchmark-test-imports.mjs",
    ),
    "utf8",
  )
  // Execute the production fingerprint functions against a real Git fixture.
  const fingerprint = runInNewContext(
    source.slice(
      source.indexOf("function git("),
      source.indexOf("\nfunction inventory("),
    ) + "\ninputHash",
    { root: directory, execFileSync, createHash, readFileSync, path },
  )
  return { config, generatedConfig, fingerprint }
}

test("benchmark fingerprints change when TypeScript transform settings change", (context) => {
  const { config, fingerprint } = fingerprintFixture(context)
  const before = fingerprint()
  assert.equal(fingerprint(), before)
  writeFileSync(
    config,
    JSON.stringify({
      extends: "./.wxt/tsconfig.json",
      compilerOptions: { target: "ES2020" },
    }),
  )
  assert.notEqual(fingerprint(), before)
})

test("benchmark fingerprints include the ignored extended TypeScript config", (context) => {
  const { generatedConfig, fingerprint } = fingerprintFixture(context)
  const before = fingerprint()
  writeFileSync(
    generatedConfig,
    JSON.stringify({ compilerOptions: { experimentalDecorators: true } }),
  )
  assert.notEqual(fingerprint(), before)
})

test("benchmark fingerprints reject a missing extended TypeScript config", (context) => {
  const { generatedConfig, fingerprint } = fingerprintFixture(context)
  rmSync(generatedConfig)
  assert.throws(fingerprint, /ENOENT.*tsconfig\.json/)
})

function capture(directory, duration, workerErrors = []) {
  for (const group of ["baseline", "final-pr", "merged-main"]) {
    for (let shard = 1; shard <= 6; shard++) {
      const folder = path.join(directory, group, `vitest-blob-report-${shard}`)
      mkdirSync(folder, { recursive: true })
      writeFileSync(
        path.join(folder, `blob-${shard}-6.json`),
        stringify([
          "4.0.17",
          [
            {
              name: `tests/fixture-${shard}.test.ts`,
              result: { duration: 100 },
            },
          ],
          group === "baseline" && shard === 1 ? workerErrors : [],
        ]),
      )
    }
  }
  const folder = path.join(directory, "e2e-main")
  mkdirSync(folder, { recursive: true })
  for (let shard = 1; shard <= 6; shard++) {
    writeFileSync(
      path.join(folder, `shard-${shard}.json`),
      JSON.stringify({
        suites: [
          {
            specs: specs
              .filter((_, index) => index % 6 === shard - 1)
              .map((file) => ({
                id: file,
                file,
                tests: [{ projectName: "chromium", results: [{ duration }] }],
              })),
          },
        ],
      }),
    )
  }
}

test("replay accepts a complete capture without worker errors", (context) => {
  const directory = temporaryDirectory(context)
  capture(directory, 100)
  const output = path.join(directory, "summary.json")
  const run = spawnSync(
    process.execPath,
    [replay, "--input-root", directory, "--output", output],
    { encoding: "utf8" },
  )
  assert.equal(run.status, 0, run.stdout + run.stderr)
  const summary = JSON.parse(readFileSync(output, "utf8"))
  assert.equal(summary.unit.sameMainAndPrMembership, true)
  assert.equal(summary.e2e.unknown.length, 0)
})

for (const errors of [
  [{ message: "worker crashed after collecting files" }],
  null,
]) {
  test(`replay rejects unusable worker-error metadata (${JSON.stringify(errors)})`, (context) => {
    const directory = temporaryDirectory(context)
    capture(directory, 100, errors)
    const run = spawnSync(
      process.execPath,
      [
        replay,
        "--input-root",
        directory,
        "--output",
        path.join(directory, "summary.json"),
      ],
      { encoding: "utf8" },
    )
    assert.notEqual(run.status, 0)
    assert.match(run.stderr, /Reject worker errors/)
  })
}

test("concurrent replays keep their own duration manifests in a shared output directory", async (context) => {
  const directory = temporaryDirectory(context)
  const preload = path.join(directory, "barrier.mjs")
  writeFileSync(
    preload,
    `import fs from "node:fs"
import path from "node:path"
const original = fs.readFileSync
fs.readFileSync = function(file, ...args) {
  if (path.basename(String(file)).startsWith("e2e-manifest")) {
    const folder = process.env.REPLAY_BARRIER_DIRECTORY
    fs.writeFileSync(path.join(folder, process.env.REPLAY_BARRIER_NAME), "")
    const deadline = Date.now() + 30000
    while (!["low", "high"].every(name => fs.existsSync(path.join(folder, name)))) {
      if (Date.now() > deadline) throw new Error("Replay barrier timed out")
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10)
    }
  }
  return original.call(this, file, ...args)
}
`,
  )
  const results = await Promise.all(
    [100, 900].map(async (duration, index) => {
      const label = index === 0 ? "low" : "high"
      const input = path.join(directory, `capture-${label}`)
      capture(input, duration)
      const output = path.join(directory, `${label}.json`)
      const child = spawn(
        process.execPath,
        [
          "--import",
          pathToFileURL(preload).href,
          replay,
          "--input-root",
          input,
          "--output",
          output,
        ],
        {
          env: {
            ...process.env,
            REPLAY_BARRIER_DIRECTORY: directory,
            REPLAY_BARRIER_NAME: label,
          },
        },
      )
      let log = ""
      child.stdout.on("data", (chunk) => {
        log += chunk
      })
      child.stderr.on("data", (chunk) => {
        log += chunk
      })
      const status = await new Promise((resolve, reject) => {
        child.on("error", reject)
        child.on("close", resolve)
      })
      return { duration, output, status, log }
    }),
  )
  for (const { duration, output, status, log } of results) {
    assert.equal(status, 0, log)
    const summary = JSON.parse(readFileSync(output, "utf8"))
    const total = summary.e2e.plannedShards.reduce(
      (sum, shard) => sum + shard.measuredCaseSeconds,
      0,
    )
    assert.equal(Math.round(total * 100), (specs.length * duration) / 10)
  }
})
