import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import { cpus, platform } from "node:os"
import path from "node:path"
import { performance } from "node:perf_hooks"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"

import { measureFileCost } from "../../scripts/utils/unitTestDurations.mjs"
import { parseVitestBlob } from "../../scripts/utils/vitestBlob.mjs"

const root = fileURLToPath(new URL("../../", import.meta.url))
const { values } = parseArgs({
  options: {
    suite: { type: "string", default: "heavy" },
    "ci-reports": { type: "boolean", default: false },
    rounds: { type: "string", default: "3" },
    variants: { type: "string", default: "baseline,json-report" },
    label: {
      type: "string",
      default: new Date().toISOString().replaceAll(/[:.]/g, "-"),
    },
  },
})
assert.match(values.label, /^[a-zA-Z0-9_-]+$/)
assert.ok(["heavy", "pure"].includes(values.suite))
const rounds = Number(values.rounds)
assert.ok(Number.isInteger(rounds) && rounds > 0)
const variants = values.variants.split(",")
assert.ok(
  values.suite === "pure" ||
    !variants.some((variant) => variant.startsWith("light-")),
)
assert.equal(variants[0], "baseline", "The first variant must be the baseline")
assert.equal(new Set(variants).size, variants.length)
assert.ok(
  variants.every((variant) =>
    [
      "baseline",
      "optimizer",
      "module-cache",
      "json-report",
      "light-setup",
      "light-module-cache",
    ].includes(variant),
  ),
)
const output = path.join(
  root,
  ".scratch/ci-runner-performance/artifacts/imports-" + values.label,
)
mkdirSync(output, { recursive: true })
const files = [
  "tests/entrypoints/options/pages/ApiCredentialProfiles/ApiCredentialProfiles.test.tsx",
  "tests/features/AccountManagement/components/AccountDialogForm.test.tsx",
  "tests/services/apiService/passwordUi.test.ts",
  "tests/services/runtimeTypedMessagingSetup.test.ts",
]
const pureTargets = [
  ["tests/utils/string.test.ts", "src/utils/core/string.ts"],
  ["tests/utils/object.test.ts", "src/utils/core/object.ts"],
  ["tests/utils/number.test.ts", "src/utils/core/number.ts"],
  ["tests/utils/money.test.ts", "src/utils/core/money.ts"],
  ["tests/utils/urlParsing.test.ts", "src/utils/core/urlParsing.ts"],
  [
    "tests/utils/sanitizeUrlForLog.test.ts",
    "src/utils/core/sanitizeUrlForLog.ts",
  ],
  ["tests/utils/modelName.test.ts", "src/services/models/utils/modelName.ts"],
]
if (values.suite === "pure")
  files.splice(0, files.length, ...pureTargets.map(([test]) => test))

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" })
}

function inputHash() {
  const hash = createHash("sha256")
  const inputs = git(
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "-z",
    "--",
    "src",
    "tests",
    "scripts",
    "plugins",
    "vitest.config.ts",
    "vitest.shardSequencer.ts",
    "tsconfig.json",
    "package.json",
    "pnpm-lock.yaml",
  )
  for (const file of inputs.split("\0").filter(Boolean).sort()) {
    hash.update(file)
    hash.update(readFileSync(path.join(root, file)))
  }
  return hash.digest("hex")
}

function inventory(report) {
  const cases = []
  for (const file of report[1]) {
    assert.equal(file.result?.state, "pass", file.filepath)
    assert.equal(
      file.pool,
      "threads",
      "Keep worker isolation and pool unchanged",
    )
    const filename = path.relative(root, file.filepath).replaceAll("\\", "/")
    function visit(task, titles) {
      const names = [...titles, task.name]
      if (task.type === "test") {
        assert.ok(
          ["pass", "skip"].includes(task.result?.state || task.mode),
          names.join(" / "),
        )
        cases.push(
          JSON.stringify([
            file.projectName,
            filename,
            names,
            task.mode,
            task.result?.state,
          ]),
        )
      } else for (const child of task.tasks || []) visit(child, names)
    }
    for (const task of file.tasks) visit(task, [])
  }
  assert.deepEqual(report[2], [], "Reject worker errors")
  assert.equal(report[1].length, files.length)
  return cases.sort()
}

const sourceHash = inputHash()
const configs = {}
for (const variant of variants) {
  const viteCache = JSON.stringify(path.join(output, "vite-" + variant))
  const moduleCache = JSON.stringify(path.join(output, "module-" + variant))
  const useModuleCache =
    variant === "module-cache" || variant === "light-module-cache"
  const major = Number(
    JSON.parse(
      readFileSync(path.join(root, "node_modules/vitest/package.json"), "utf8"),
    ).version.split(".")[0],
  )
  const cacheOptions =
    major >= 5
      ? `fsModuleCache: ${useModuleCache}, fsModuleCachePath: ${moduleCache}`
      : `experimental: { fsModuleCache: ${useModuleCache}, fsModuleCachePath: ${moduleCache} }`
  const config = `import { mergeConfig } from "vitest/config"\nimport base from "../../../../vitest.config"\nconst config = mergeConfig(base, { cacheDir: ${viteCache}, test: { ${cacheOptions}, deps: { optimizer: { client: { enabled: ${variant === "optimizer"}, include: ["lucide-react"] } } } } })\n${variant.startsWith("light-") ? 'for (const project of config.test.projects) if (project.test.name === "node") project.test.setupFiles = []\n' : ""}export default config\n`

  configs[variant] = path.join(output, variant + ".config.ts")
  writeFileSync(configs[variant], config)
}

const version = JSON.parse(
  readFileSync(path.join(root, "node_modules/vitest/package.json"), "utf8"),
).version
const result = {
  node: process.version,
  platform: platform(),
  cpu: cpus()[0]?.model,
  head: git("rev-parse", "HEAD").trim(),
  sourceHash,
  version,
  suite: values.suite,
  coverageReporters: values["ci-reports"] ? ["json"] : "project defaults",
  files,
  variants,
  records: [],
  rejected: [],
}
writeFileSync(path.join(output, "result.json"), JSON.stringify(result, null, 2))
let expectedCases
let expectedCoveredFiles
let expectedCoverageTargets
let expectedSourceFiles
const rejected = new Set()
for (let round = 1; round <= rounds; round++) {
  const order = round % 2 ? variants : variants.toReversed()
  for (const variant of order) {
    if (rejected.has(variant)) continue
    assert.equal(inputHash(), sourceHash, "Benchmark inputs changed")
    const directory = path.join(output, `${round}-${variant}`)
    mkdirSync(directory)
    const log = openSync(path.join(directory, "run.log"), "w")
    const started = performance.now()
    const run = spawnSync(
      process.execPath,
      [
        path.join(root, "node_modules/vitest/vitest.mjs"),
        "run",
        ...files,
        "--config",
        configs[variant],
        "--maxWorkers=2",
        "--coverage",
        ...(variant === "json-report" || values["ci-reports"]
          ? ["--coverage.reporter=json"]
          : []),
        "--coverage.thresholds.statements=0",
        "--coverage.thresholds.branches=0",
        "--coverage.thresholds.functions=0",
        "--coverage.thresholds.lines=0",
        "--reporter=default",
        "--reporter=blob",
        `--outputFile.blob=${path.join(directory, "blob.json")}`,
        `--coverage.reportsDirectory=${path.join(directory, "coverage")}`,
      ],
      {
        cwd: root,
        stdio: ["ignore", log, log],
        env: {
          ...process.env,
          DEBUG: variant.endsWith("module-cache") ? "vitest:cache:fs" : "",
        },
      },
    )
    const elapsed = (performance.now() - started) / 1000
    closeSync(log)
    try {
      assert.equal(run.status, 0, "See " + path.join(directory, "run.log"))
      const report = parseVitestBlob(
        readFileSync(path.join(directory, "blob.json"), "utf8"),
      )
      const cases = inventory(report)
      expectedCases ||= cases
      assert.deepEqual(cases, expectedCases, "Same cases and outcomes required")
      const coverage = JSON.parse(
        readFileSync(
          path.join(directory, "coverage/coverage-final.json"),
          "utf8",
        ),
      )
      const coveredFiles = Object.entries(coverage)
        .filter(([, file]) => Object.values(file.s).some((count) => count > 0))
        .map(([name]) => name)
        .sort()
      assert.ok(coveredFiles.length > 0, "Coverage must be usable")
      const sourceFiles = Object.keys(coverage).sort()
      expectedSourceFiles ||= sourceFiles
      assert.deepEqual(
        sourceFiles,
        expectedSourceFiles,
        "Same source inventory required",
      )
      expectedCoveredFiles ||= coveredFiles
      assert.deepEqual(
        coveredFiles,
        expectedCoveredFiles,
        "Same covered source files required",
      )
      if (values.suite === "pure") {
        // Removing setup stops incidental module execution. Require identical
        // statement, branch and function hits in every tested production module.
        const targets = pureTargets.map(([, source]) => {
          const target = coverage[path.join(root, source)]
          assert.ok(target, "Missing target coverage: " + source)
          return target
        })
        expectedCoverageTargets ||= targets
        assert.deepEqual(
          targets,
          expectedCoverageTargets,
          "Same tested module coverage required",
        )
      }
      const record = {
        round,
        variant,
        elapsed,
        cases: cases.length,
        coveredFiles: coveredFiles.length,
        sourceFiles: sourceFiles.length,
        collectSeconds:
          report[1].reduce(
            (sum, file) => sum + (file.collectDuration || 0),
            0,
          ) / 1000,
        testSeconds:
          report[1].reduce(
            (sum, file) => sum + (file.result.duration || 0),
            0,
          ) / 1000,
        fileCostSeconds:
          report[1].reduce((sum, file) => sum + measureFileCost(file), 0) /
          1000,
      }
      result.records.push(record)
      writeFileSync(
        path.join(output, "result.json"),
        JSON.stringify(result, null, 2),
      )
      console.log(JSON.stringify(record))
    } catch (error) {
      if (variant === "baseline") throw error
      rejected.add(variant)
      const rejection = {
        round,
        variant,
        reason: error.message.split("\n")[0],
        directory,
      }
      result.rejected.push(rejection)
      writeFileSync(
        path.join(output, "result.json"),
        JSON.stringify(result, null, 2),
      )
      console.log(JSON.stringify({ rejected: rejection }))
    }
  }
}
assert.equal(inputHash(), sourceHash, "Benchmark inputs changed")
console.log("Evidence: " + path.join(output, "result.json"))
