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
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"

const cli = fileURLToPath(
  new URL("../../scripts/pr-related-tests.mjs", import.meta.url),
)

function invokeAt(root, args, env = {}) {
  return spawnSync(process.execPath, [cli, ...args, "--root", root], {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000,
    env: { ...process.env, GITHUB_OUTPUT: "", GITHUB_STEP_SUMMARY: "", ...env },
  })
}

function fixture(context) {
  const root = mkdtempSync(join(tmpdir(), "pr-related-tests-"))
  context.after(() => {
    assert.ok(root.startsWith(join(tmpdir(), "pr-related-tests-")))
    rmSync(root, { recursive: true, force: true })
  })
  function write(file, content) {
    mkdirSync(dirname(join(root, file)), { recursive: true })
    writeFileSync(join(root, file), content)
  }
  function git(...args) {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8" })
    assert.equal(result.status, 0, result.stdout + result.stderr)
    return result.stdout.trim()
  }
  function commit() {
    git("add", ".")
    git(
      "-c",
      "user.name=CI fixture",
      "-c",
      "user.email=ci@example.invalid",
      "commit",
      "-m",
      "test: fixture",
    )
    return git("rev-parse", "HEAD")
  }
  function invoke(...args) {
    return invokeAt(root, args)
  }
  git("init", "-q")
  write(
    "vitest.config.mjs",
    'export default { test: { globals: true, include: ["tests/**/*.test.ts"], maxWorkers: 1 } }\n',
  )
  write("package.json", '{"type":"module"}\n')
  return { root, write, git, commit, invoke }
}

test("a source edit previews direct and indirect importers without running unrelated tests", (context) => {
  const project = fixture(context)
  project.write("src/value.ts", "export const value = 1\n")
  project.write("src/wrapper.ts", 'export { value } from "./value"\n')
  project.write(
    "tests/direct.test.ts",
    'import { value } from "../src/value"\ntest("direct", () => expect(value).toBeGreaterThan(0))\n',
  )
  project.write(
    "tests/indirect.test.ts",
    'import { value } from "../src/wrapper"\ntest("indirect", () => expect(value).toBeGreaterThan(0))\n',
  )
  project.write(
    "tests/unrelated.test.ts",
    'test("unrelated", () => expect(true).toBe(false))\n',
  )
  const base = project.commit()
  project.write("src/value.ts", "export const value = 2\n")
  const head = project.commit()
  const output = join(project.root, "plan.json")
  const planned = project.invoke("plan", "--base", base, "--output", output)
  assert.equal(planned.status, 0, planned.stdout + planned.stderr)
  const plan = JSON.parse(readFileSync(output, "utf8"))
  assert.equal(plan.head, head)
  assert.deepEqual(plan.files, [
    "tests/direct.test.ts",
    "tests/indirect.test.ts",
  ])
  const run = project.invoke("run", "--plan", output)
  assert.equal(run.status, 0, run.stdout + run.stderr)
  assert.match(run.stdout, /2 passed/)
})

test("a broad edit keeps the preview bounded and prioritizes directly changed tests", (context) => {
  const project = fixture(context)
  project.write("src/shared.ts", "export const value = 1\n")
  for (const name of ["a", "b", "changed"]) {
    project.write(
      `tests/${name}.test.ts`,
      'import { value } from "../src/shared"\ntest("value", () => expect(value).toBeGreaterThan(0))\n',
    )
  }
  const base = project.commit()
  project.write("src/shared.ts", "export const value = 2\n")
  project.write(
    "tests/changed.test.ts",
    'import { value } from "../src/shared"\ntest("edited test", () => expect(value).toBe(2))\n',
  )
  project.commit()
  const output = join(project.root, "plan.json")
  const planned = project.invoke(
    "plan",
    "--base",
    base,
    "--output",
    output,
    "--max-files",
    "2",
  )
  assert.equal(planned.status, 0, planned.stdout + planned.stderr)
  const plan = JSON.parse(readFileSync(output, "utf8"))
  assert.deepEqual(plan.files, ["tests/changed.test.ts"])
  assert.match(plan.reason, /limit.*full CI/i)
  const run = project.invoke("run", "--plan", output)
  assert.equal(run.status, 0, run.stdout + run.stderr)
  assert.match(run.stdout, /1 passed/)
})

test("test setup changes preview edited tests while leaving global validation to full CI", (context) => {
  const project = fixture(context)
  project.write(
    "tests/changed.test.ts",
    'test("changed", () => expect(true).toBe(true))\n',
  )
  project.write(
    "tests/unrelated.test.ts",
    'test("unrelated", () => expect(true).toBe(false))\n',
  )
  const base = project.commit()
  project.write(
    "vitest.config.mjs",
    'export default { test: { globals: true, include: ["tests/**/*.test.ts"], maxWorkers: 1, testTimeout: 1000 } }\n',
  )
  project.write(
    "tests/changed.test.ts",
    'test("edited", () => expect(2 + 2).toBe(4))\n',
  )
  project.commit()
  const output = join(project.root, "plan.json")
  const planned = project.invoke("plan", "--base", base, "--output", output)
  assert.equal(planned.status, 0, planned.stdout + planned.stderr)
  const plan = JSON.parse(readFileSync(output, "utf8"))
  assert.deepEqual(plan.files, ["tests/changed.test.ts"])
  assert.match(plan.reason, /global.*full CI/i)
  const run = project.invoke("run", "--plan", output)
  assert.equal(run.status, 0, run.stdout + run.stderr)
})

test("workflow edits include guards that read workflow files at runtime", (context) => {
  const project = fixture(context)
  project.write(".github/workflows/test.yml", "name: old\n")
  project.write(
    "tests/scripts/ciScheduling.test.ts",
    'import { readFileSync } from "node:fs"\ntest("workflow", () => expect(readFileSync(".github/workflows/test.yml", "utf8")).toContain("ready"))\n',
  )
  project.write(
    "tests/unrelated.test.ts",
    'test("unrelated", () => expect(true).toBe(false))\n',
  )
  const base = project.commit()
  project.write(".github/workflows/test.yml", "name: ready\n")
  project.commit()
  const output = join(project.root, "plan.json")
  const planned = project.invoke("plan", "--base", base, "--output", output)
  assert.equal(planned.status, 0, planned.stdout + planned.stderr)
  const plan = JSON.parse(readFileSync(output, "utf8"))
  assert.equal(plan.ciScripts, true)
  assert.deepEqual(plan.files, ["tests/scripts/ciScheduling.test.ts"])
  const run = project.invoke("run", "--plan", output)
  assert.equal(run.status, 0, run.stdout + run.stderr)
  assert.match(run.stdout, /1 passed/)
})

test("a failing selected test returns a failing process status", (context) => {
  const project = fixture(context)
  project.write("src/value.ts", "export const value = 1\n")
  project.write(
    "tests/value.test.ts",
    'import { value } from "../src/value"\ntest("regression", () => expect(value).toBe(1))\n',
  )
  const base = project.commit()
  project.write("src/value.ts", "export const value = 2\n")
  project.commit()
  const output = join(project.root, "plan.json")
  const planned = project.invoke("plan", "--base", base, "--output", output)
  assert.equal(planned.status, 0, planned.stdout + planned.stderr)
  const run = project.invoke("run", "--plan", output)
  assert.equal(run.status, 1, run.stdout + run.stderr)
  assert.match(run.stdout + run.stderr, /regression/)
})

test("renaming a source path with spaces keeps its related test in the preview", (context) => {
  const project = fixture(context)
  project.write("src/old value.ts", "export const value = 1\n")
  project.write("src/wrapper.ts", 'export { value } from "./old value"\n')
  project.write(
    "tests/with spaces.test.ts",
    'import { value } from "../src/wrapper"\ntest("value", () => expect(value).toBe(1))\n',
  )
  const base = project.commit()
  project.git("mv", "src/old value.ts", "src/new value.ts")
  project.write("src/wrapper.ts", 'export { value } from "./new value"\n')
  project.commit()
  const output = join(project.root, "plan.json")
  const planned = project.invoke("plan", "--base", base, "--output", output)
  assert.equal(planned.status, 0, planned.stdout + planned.stderr)
  const plan = JSON.parse(readFileSync(output, "utf8"))
  assert.ok(plan.changed.includes("src/old value.ts"))
  assert.ok(plan.changed.includes("src/new value.ts"))
  assert.deepEqual(plan.files, ["tests/with spaces.test.ts"])
  const run = project.invoke("run", "--plan", output)
  assert.equal(run.status, 0, run.stdout + run.stderr)
})

test("editing only a test avoids loading the unrelated source graph", (context) => {
  const project = fixture(context)
  project.write(
    "tests/changed.test.ts",
    'test("changed", () => expect(true).toBe(true))\n',
  )
  project.write(
    "tests/unrelated.test.ts",
    'import { missing } from "../src/missing"\ntest("unrelated", () => expect(missing).toBe(true))\n',
  )
  const base = project.commit()
  project.write(
    "tests/changed.test.ts",
    'test("edited", () => expect(2 + 2).toBe(4))\n',
  )
  project.commit()
  const output = join(project.root, "plan.json")
  const planned = project.invoke("plan", "--base", base, "--output", output)
  assert.equal(planned.status, 0, planned.stdout + planned.stderr)
  assert.deepEqual(JSON.parse(readFileSync(output, "utf8")).files, [
    "tests/changed.test.ts",
  ])
  const run = project.invoke("run", "--plan", output)
  assert.equal(run.status, 0, run.stdout + run.stderr)
})

test("a shallow CI checkout fetches only the exact missing base commit", (context) => {
  const project = fixture(context)
  project.write("src/value.ts", "export const value = 1\n")
  project.write(
    "tests/value.test.ts",
    'import { value } from "../src/value"\ntest("value", () => expect(value).toBeGreaterThan(0))\n',
  )
  const base = project.commit()
  project.write("src/value.ts", "export const value = 2\n")
  project.commit()
  const remote = join(project.root, "remote.git")
  const checkout = join(project.root, "shallow")
  project.git("clone", "--bare", "--no-local", project.root, remote)
  project.git("clone", "--depth=1", pathToFileURL(remote).href, checkout)
  assert.notEqual(
    spawnSync("git", ["cat-file", "-e", `${base}^{commit}`], { cwd: checkout })
      .status,
    0,
  )
  const planned = invokeAt(checkout, [
    "plan",
    "--base",
    base,
    "--fetch-base",
    "--output",
    "plan.json",
  ])
  assert.equal(planned.status, 0, planned.stdout + planned.stderr)
  const plan = JSON.parse(readFileSync(join(checkout, "plan.json"), "utf8"))
  assert.equal(plan.base, base)
  assert.deepEqual(plan.files, ["tests/value.test.ts"])
  const history = spawnSync("git", ["rev-list", "--count", "HEAD"], {
    cwd: checkout,
    encoding: "utf8",
  })
  assert.equal(history.stdout.trim(), "1")
})

test("deleting an imported module previews the test that will report the missing import", (context) => {
  const project = fixture(context)
  project.write("src/value.ts", "export const value = 1\n")
  project.write(
    "tests/value.test.ts",
    'import { value } from "../src/value"\ntest("value", () => expect(value).toBe(1))\n',
  )
  const base = project.commit()
  project.git("rm", "src/value.ts")
  project.commit()
  const output = join(project.root, "plan.json")
  const planned = project.invoke("plan", "--base", base, "--output", output)
  assert.equal(planned.status, 0, planned.stdout + planned.stderr)
  assert.deepEqual(JSON.parse(readFileSync(output, "utf8")).files, [
    "tests/value.test.ts",
  ])
  const run = project.invoke("run", "--plan", output)
  assert.equal(run.status, 1, run.stdout + run.stderr)
  assert.match(run.stdout + run.stderr, /value|import/)
})

test("deleting a directory entry module still previews its importers", (context) => {
  const project = fixture(context)
  project.write("src/value/index.ts", "export const value = 1\n")
  project.write("src/value/retained.ts", "export const retained = true\n")
  project.write(
    "tests/value.test.ts",
    'import { value } from "../src/value"\ntest("value", () => expect(value).toBe(1))\n',
  )
  const base = project.commit()
  project.git("rm", "src/value/index.ts")
  project.commit()
  const output = join(project.root, "plan.json")
  const planned = project.invoke("plan", "--base", base, "--output", output)
  assert.equal(planned.status, 0, planned.stdout + planned.stderr)
  assert.deepEqual(JSON.parse(readFileSync(output, "utf8")).files, [
    "tests/value.test.ts",
  ])
})

test("aliases, literal dynamic imports and cyclic imports keep their related test", (context) => {
  const project = fixture(context)
  project.write(
    "vitest.config.mjs",
    'import { fileURLToPath } from "node:url"\nexport default { resolve: { alias: { "~": fileURLToPath(new URL("./src", import.meta.url)) } }, test: { globals: true, include: ["tests/**/*.test.ts"], maxWorkers: 1 } }\n',
  )
  project.write(
    "src/value.ts",
    'import { cycle } from "./cycle"\nexport const value = 1\nexport function other() { return cycle() }\n',
  )
  project.write(
    "src/cycle.ts",
    'import { value } from "./value"\nexport function cycle() { return value }\n',
  )
  project.write("src/lazy.ts", 'export const load = () => import("~/value")\n')
  project.write(
    "tests/lazy.test.ts",
    'import { load } from "~/lazy"\ntest("lazy", async () => expect((await load()).other()).toBeGreaterThan(0))\n',
  )
  const base = project.commit()
  project.write(
    "src/value.ts",
    'import { cycle } from "./cycle"\nexport const value = 2\nexport function other() { return cycle() }\n',
  )
  project.commit()
  const output = join(project.root, "plan.json")
  const planned = project.invoke("plan", "--base", base, "--output", output)
  assert.equal(planned.status, 0, planned.stdout + planned.stderr)
  assert.deepEqual(JSON.parse(readFileSync(output, "utf8")).files, [
    "tests/lazy.test.ts",
  ])
  const run = project.invoke("run", "--plan", output)
  assert.equal(run.status, 0, run.stdout + run.stderr)
})

test("glob consumers are previewed when one of their data files changes", (context) => {
  const project = fixture(context)
  project.write("src/data/value.json", '{"value":1}\n')
  project.write(
    "src/data.ts",
    'export const data = import.meta.glob("./data/*.json", { eager: true, import: "default" })\n',
  )
  project.write(
    "tests/data.test.ts",
    'import { data } from "../src/data"\ntest("data", () => expect(Object.keys(data)).toHaveLength(1))\n',
  )
  const base = project.commit()
  project.write("src/data/value.json", '{"value":2}\n')
  project.commit()
  const output = join(project.root, "plan.json")
  const planned = project.invoke("plan", "--base", base, "--output", output)
  assert.equal(planned.status, 0, planned.stdout + planned.stderr)
  assert.deepEqual(JSON.parse(readFileSync(output, "utf8")).files, [
    "tests/data.test.ts",
  ])
  const run = project.invoke("run", "--plan", output)
  assert.equal(run.status, 0, run.stdout + run.stderr)
})

test("documentation-only changes produce an empty preview and accurate workflow outputs", (context) => {
  const project = fixture(context)
  project.write(
    "tests/unrelated.test.ts",
    'test("unrelated", () => expect(true).toBe(false))\n',
  )
  const base = project.commit()
  project.write("README.md", "Documentation change\n")
  project.commit()
  const output = join(project.root, "plan.json")
  const githubOutput = join(project.root, "github-output")
  const summary = join(project.root, "summary.md")
  const planned = invokeAt(
    project.root,
    ["plan", "--base", base, "--output", output],
    {
      GITHUB_OUTPUT: githubOutput,
      GITHUB_STEP_SUMMARY: summary,
    },
  )
  assert.equal(planned.status, 0, planned.stdout + planned.stderr)
  const plan = JSON.parse(readFileSync(output, "utf8"))
  assert.deepEqual(plan.files, [])
  assert.equal(plan.ciScripts, false)
  assert.match(
    readFileSync(githubOutput, "utf8"),
    /has-tests=false\nci-scripts=false/,
  )
  assert.match(readFileSync(summary, "utf8"), /six full shards.*independently/)
  const run = project.invoke("run", "--plan", output)
  assert.equal(run.status, 0, run.stdout + run.stderr)
  assert.match(run.stdout, /No related test files/)
})

test("a plan from an earlier head is rejected instead of validating the wrong revision", (context) => {
  const project = fixture(context)
  project.write(
    "tests/value.test.ts",
    'test("value", () => expect(true).toBe(true))\n',
  )
  const base = project.commit()
  const output = join(project.root, "plan.json")
  const planned = project.invoke("plan", "--base", base, "--output", output)
  assert.equal(planned.status, 0, planned.stdout + planned.stderr)
  project.write("README.md", "Next revision\n")
  project.commit()
  const run = project.invoke("run", "--plan", output)
  assert.equal(run.status, 1, run.stdout + run.stderr)
  assert.match(run.stdout + run.stderr, /different HEAD/)
})
