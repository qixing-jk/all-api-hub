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
