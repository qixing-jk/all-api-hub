import { execFileSync } from "node:child_process"
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import { dirname, isAbsolute, relative, resolve } from "node:path"
import { parseArgs } from "node:util"
import ts from "typescript"
import { createVitest, startVitest } from "vitest/node"

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    base: { type: "string" },
    root: { type: "string", default: process.cwd() },
    output: { type: "string" },
    plan: { type: "string" },
    "max-files": { type: "string", default: "60" },
    "fetch-base": { type: "boolean", default: false },
  },
})
const root = resolve(values.root)
process.chdir(root)

const globalInput =
  /^(?:package\.json|pnpm-(?:lock\.yaml|workspace\.yaml)|\.nvmrc|\.env[^/]*|(?:vitest|vite|wxt|i18next)\.[^/]+|tsconfig[^/]*\.json|tests\/(?:setup[^/]*|msw\/.*|test-utils\/.*))$/
const ciInput =
  /^(?:\.github\/|\.husky\/|scripts\/|tests\/scripts\/|(?:package\.json|pnpm-(?:lock\.yaml|workspace\.yaml)|commitlint\.config\.[^/]+|vitest\.[^/]+)$)/
const ciTests = [
  "tests/scripts/ciScheduling.test.ts",
  "tests/scripts/ciPlaywrightBrowserCache.test.ts",
]
// These CLIs are exercised by test:ci:scripts, including their runtime file reads.
const ciTool =
  /^scripts\/(?:(?:pr-related-tests|check-unit-test-reports|write-unit-test-durations|release-pr-check)\.mjs|utils\/(?:vitestBlob|unitTestDurations|run-pnpm)\.mjs)$/

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" })
}

const codeFile = /\.[cm]?[jt]sx?$/
const sourceExtensions = [
  "",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".cjs",
  ".cts",
  ".json",
  "/index.ts",
  "/index.tsx",
  "/index.js",
]
const normalized = (file) => resolve(file).replaceAll("\\", "/")

/** Visit each source once per alias configuration, then follow importers backwards. */
async function relatedSpecifications(vitest, changed) {
  const specifications = await vitest.globTestSpecifications()
  const changedPaths = new Set(
    changed.map((file) => normalized(resolve(root, file))),
  )
  const groups = new Map()
  for (const specification of specifications) {
    const aliases = specification.project.vite.config.resolve.alias.filter(
      (alias) => typeof alias.find === "string",
    )
    const key = JSON.stringify(aliases)
    if (!groups.has(key)) groups.set(key, { aliases, specifications: [] })
    groups.get(key).specifications.push(specification)
  }
  const selected = new Set()
  const imports = new Map()
  for (const { aliases, specifications: group } of groups.values()) {
    const paths = Object.fromEntries(
      aliases.flatMap(({ find, replacement }) => [
        [find, [replacement]],
        [find + "/*", [replacement + "/*"]],
      ]),
    )
    const options = {
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      module: ts.ModuleKind.ESNext,
      allowJs: true,
      resolveJsonModule: true,
      paths,
    }
    const cache = ts.createModuleResolutionCache(root, normalized, options)
    const queue = group.map((specification) =>
      normalized(specification.moduleId),
    )
    const visited = new Set(queue)
    const importers = new Map()
    for (let index = 0; index < queue.length; index++) {
      const file = queue[index]
      if (!codeFile.test(file) || !existsSync(file)) continue
      if (!imports.has(file)) {
        const source = readFileSync(file, "utf8")
        imports.set(file, {
          files: ts.preProcessFile(source, true, true).importedFiles,
          glob: source.includes("import.meta.glob"),
        })
      }
      // Globs can also lose deleted inputs; conservatively preview their consumers.
      if (imports.get(file).glob) {
        for (const path of changedPaths) {
          if (!importers.has(path)) importers.set(path, new Set())
          importers.get(path).add(file)
        }
      }
      for (const imported of imports.get(file).files) {
        const name = imported.fileName.split("?")[0]
        const alias = aliases.find(
          ({ find }) => name === find || name.startsWith(find + "/"),
        )
        if (!name.startsWith(".") && !alias) continue
        const resolvedModule = ts.resolveModuleName(
          name,
          file,
          options,
          ts.sys,
          cache,
        ).resolvedModule
        const stem = alias
          ? alias.replacement + name.slice(alias.find.length)
          : resolve(dirname(file), name)
        const dependency =
          resolvedModule?.resolvedFileName ||
          sourceExtensions
            .map((extension) => normalized(stem + extension))
            .find(
              (candidate) =>
                ts.sys.fileExists(candidate) || changedPaths.has(candidate),
            )
        if (!dependency) continue
        const path = normalized(dependency)
        const local = relative(root, path).replaceAll("\\", "/")
        if (
          isAbsolute(local) ||
          local.startsWith("../") ||
          local.split("/").includes("node_modules")
        )
          continue
        if (!importers.has(path)) importers.set(path, new Set())
        importers.get(path).add(file)
        if (!visited.has(path)) {
          visited.add(path)
          queue.push(path)
        }
      }
    }
    const affected = [...changedPaths]
    const seen = new Set(affected)
    for (let index = 0; index < affected.length; index++) {
      for (const importer of importers.get(affected[index]) || []) {
        if (seen.has(importer)) continue
        seen.add(importer)
        affected.push(importer)
      }
    }
    for (const specification of group) {
      if (seen.has(normalized(specification.moduleId)))
        selected.add(specification)
    }
  }
  return [...selected]
}

async function plan() {
  if (!values.base || !values.output) {
    throw new Error("plan requires --base and --output")
  }
  if (values["fetch-base"]) {
    if (!/^[0-9a-f]{40}$/i.test(values.base)) {
      throw new Error("--fetch-base requires a complete commit SHA")
    }
    try {
      git("cat-file", "-e", `${values.base}^{commit}`)
    } catch {
      git("fetch", "--no-tags", "--depth=1", "origin", values.base)
    }
  }
  const base = git(
    "rev-parse",
    "--verify",
    "--end-of-options",
    `${values.base}^{commit}`,
  ).trim()
  const head = git("rev-parse", "HEAD").trim()
  const maxFiles = Number(values["max-files"])
  if (!Number.isSafeInteger(maxFiles) || maxFiles < 1) {
    throw new Error("--max-files must be a positive integer")
  }
  const changed = git(
    "diff",
    "--name-only",
    "--no-renames",
    "-z",
    base,
    head,
    "--",
  )
    .split("\0")
    .filter(Boolean)
  const globalChange = changed.some((file) => globalInput.test(file))
  const ciScripts = changed.some((file) => ciInput.test(file))
  const directlyChanged = changed.filter((file) =>
    /^tests\/.*\.test\.[jt]sx?$/.test(file),
  )
  const needsGraph =
    !globalChange &&
    changed.some(
      (file) =>
        /^(?:src|plugins|scripts|tests)\/.*\.(?:[cm]?[jt]sx?|json|css)$/.test(
          file,
        ) &&
        !directlyChanged.includes(file) &&
        !ciTool.test(file) &&
        !/^tests\/scripts\/(?:.*\.test|workflowCommand)\.mjs$/.test(file),
    )
  const vitest = await createVitest("test", {
    root,
    watch: false,
    run: true,
    related: changed.map((file) => resolve(root, file)),
    coverage: { enabled: false },
  })
  let files
  try {
    const specifications = needsGraph
      ? await relatedSpecifications(vitest, changed)
      : directlyChanged.length
        ? await vitest.globTestSpecifications(directlyChanged)
        : []
    if (ciScripts)
      specifications.push(...(await vitest.globTestSpecifications(ciTests)))
    files = [
      ...new Set(
        specifications.map((spec) =>
          relative(root, spec.moduleId).replaceAll("\\", "/"),
        ),
      ),
    ].sort()
  } finally {
    await vitest.close()
  }
  const candidateCount = files.length
  let reason = globalChange
    ? "Global test inputs changed; preview edited tests and rely on full CI."
    : "Static related tests; full CI still runs."
  if (files.length > maxFiles) {
    files = files
      .filter((file) => changed.includes(file) || ciTests.includes(file))
      .slice(0, maxFiles)
    reason =
      "Related file limit exceeded; preview directly changed tests and rely on full CI."
  }
  const result = {
    head,
    base,
    changed,
    files,
    candidateCount,
    ciScripts,
    reason,
  }
  const output = resolve(root, values.output)
  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`)
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `has-tests=${files.length > 0}\nci-scripts=${ciScripts}\n`,
    )
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `Selected ${files.length} files for early unit-test feedback. ${reason}\n\n` +
        "The six full shards and coverage check run independently.\n\n" +
        files.map((file) => `- ${JSON.stringify(file)}`).join("\n") +
        "\n",
    )
  }
  console.log(`Selected ${files.length} related test files.`)
  console.log(reason)
}

async function run() {
  if (!values.plan) throw new Error("run requires --plan")
  const plan = JSON.parse(readFileSync(resolve(root, values.plan), "utf8"))
  if (
    !Array.isArray(plan.files) ||
    plan.files.some(
      (file) =>
        typeof file !== "string" ||
        !file.startsWith("tests/") ||
        file.split("/").includes("..") ||
        file.includes("\0"),
    )
  ) {
    throw new Error("The plan must contain repository-relative test paths")
  }
  if (plan.head !== git("rev-parse", "HEAD").trim()) {
    throw new Error("The related-test plan belongs to a different HEAD")
  }
  if (!plan.files.length) {
    console.log("No related test files; full CI remains authoritative.")
    return
  }
  const vitest = await startVitest("test", plan.files, {
    root,
    watch: false,
    run: true,
    maxWorkers: 2,
    bail: 1,
    coverage: { enabled: false },
  })
  await vitest?.close()
}

try {
  if (positionals[0] === "plan") await plan()
  else if (positionals[0] === "run") await run()
  else throw new Error("Use plan --base SHA --output FILE or run --plan FILE")
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
