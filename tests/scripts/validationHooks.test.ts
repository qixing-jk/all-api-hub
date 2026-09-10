import { execFileSync, spawnSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"

const temporaryRoots: string[] = []
const scriptsRoot = path.resolve("scripts")
const zeroSha = "0".repeat(40)

/** Create a real isolated Git repository with a recording pnpm substitute. */
function createRepository() {
  const root = mkdtempSync(path.join(tmpdir(), "all-api-hub-validation-"))
  temporaryRoots.push(root)
  const cwd = path.join(root, "repo")
  mkdirSync(cwd)
  const callsPath = path.join(root, "calls.jsonl")
  const pnpmPath = path.join(root, "pnpm.cjs")
  writeFileSync(
    pnpmPath,
    `require("node:fs").appendFileSync(process.env.VALIDATION_CALLS_PATH, JSON.stringify(process.argv.slice(2)) + "\\n"); process.exit(Number(process.env.VALIDATION_EXIT_CODE || 0));`,
  )
  const env = { ...process.env }
  // Hooks inherit Git state and may export uppercase NPM_EXECPATH on Windows.
  // Remove case variants before installing the isolated repository and pnpm stub.
  for (const key of Object.keys(env)) {
    if (
      key.toUpperCase().startsWith("GIT_") ||
      key.toLowerCase() === "npm_execpath"
    ) {
      delete env[key]
    }
  }
  env.npm_execpath = pnpmPath
  env.VALIDATION_CALLS_PATH = callsPath

  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd, env, encoding: "utf8" }).trim()
  const write = (file: string, content = "fixture\n") => {
    const target = path.join(cwd, file)
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, content)
  }
  const commit = () => {
    git("add", ".")
    git("commit", "-qm", "fixture")
    return git("rev-parse", "HEAD")
  }
  const run = (script: string, input = "", exitCode = 0) => {
    const result = spawnSync(
      process.execPath,
      [path.join(scriptsRoot, script)],
      {
        cwd,
        env: { ...env, VALIDATION_EXIT_CODE: String(exitCode) },
        encoding: "utf8",
        input,
      },
    )
    const calls: string[][] = existsSync(callsPath)
      ? readFileSync(callsPath, "utf8")
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
      : []
    return { ...result, calls }
  }

  git("init", "-q")
  git("config", "user.name", "Validation Test")
  git("config", "user.email", "validation@example.invalid")
  git("config", "core.autocrlf", "false")
  git("config", "core.hooksPath", path.join(root, "disabled-hooks"))
  write("README.md")
  const base = commit()
  return { git, write, commit, run, base }
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe("staged i18n validation", () => {
  it.each([
    ["src/example.ts", true],
    ["src/component.tsx", true],
    ["src/locales/zh_CN/common.json", true],
    ["src/public/_locales/en/messages.json", true],
    ["src/assets/icon.svg", false],
    ["src/styles/example.css", false],
    ["docs/docs/guide.md", false],
    ["i18next.config.ts", true],
  ])("selects checks for %s", (file, shouldCheck) => {
    const repo = createRepository()
    repo.write(file)
    repo.git("add", ".")
    const result = repo.run("run-i18n-check-if-staged.mjs")
    expect(result.status, result.stderr).toBe(0)
    expect(result.calls).toEqual(
      shouldCheck
        ? [
            ["run", "i18n:extract:ci"],
            ["run", "i18n:status"],
          ]
        : [],
    )
  })

  it.each(["delete", "rename"])(
    "checks a %s of the last source input",
    (operation) => {
      const repo = createRepository()
      repo.write("src/示例 input.ts")
      repo.commit()
      if (operation === "delete") repo.git("rm", "src/示例 input.ts")
      else repo.git("mv", "src/示例 input.ts", "README.example.md")
      const result = repo.run("run-i18n-check-if-staged.mjs")
      expect(result.status).toBe(0)
      expect(result.calls).toEqual([
        ["run", "i18n:extract:ci"],
        ["run", "i18n:status"],
      ])
    },
  )

  it("fails the gate without running status after extraction fails", () => {
    const repo = createRepository()
    repo.write("src/example.ts")
    repo.git("add", ".")
    const result = repo.run("run-i18n-check-if-staged.mjs", "", 1)
    expect(result.status).not.toBe(0)
    expect(result.calls).toEqual([["run", "i18n:extract:ci"]])
  })
})

describe("push validation", () => {
  const update = (head: string, base: string, ref = "refs/heads/main") =>
    `${ref} ${head} ${ref} ${base}\n`

  it("skips a known documentation-only range despite unrelated local source edits", () => {
    const repo = createRepository()
    repo.write("docs/docs/guide.md")
    const head = repo.commit()
    repo.write("src/unrelated.ts")
    const result = repo.run(
      "run-push-check-if-needed.mjs",
      update(head, repo.base),
    )
    expect(result.status).toBe(0)
    expect(result.calls).toEqual([])
  })

  it("checks source changes before the final documentation commit", () => {
    const repo = createRepository()
    repo.write("src/example.ts")
    repo.commit()
    repo.write("README.md", "updated\n")
    const head = repo.commit()
    const result = repo.run(
      "run-push-check-if-needed.mjs",
      update(head, repo.base),
    )
    expect(result.status).toBe(0)
    expect(result.calls).toEqual([["run", "validate:push"]])
  })

  it("checks all pushed refs once, including a non-HEAD source branch", () => {
    const repo = createRepository()
    repo.write("src/example.ts")
    const sourceHead = repo.commit()
    repo.git("checkout", "--detach", repo.base)
    repo.write("README.md", "updated\n")
    const docsHead = repo.commit()
    const result = repo.run(
      "run-push-check-if-needed.mjs",
      update(docsHead, repo.base) +
        update(sourceHead, repo.base, "refs/heads/feature"),
    )
    expect(result.status).toBe(0)
    expect(result.calls).toEqual([["run", "validate:push"]])
  })

  it.each(["src/contract.md", "docs/scripts/check.mjs", "package.json"])(
    "checks non-prose inputs such as %s",
    (file) => {
      const repo = createRepository()
      repo.write(file)
      const head = repo.commit()
      const result = repo.run(
        "run-push-check-if-needed.mjs",
        update(head, repo.base),
      )
      expect(result.status).toBe(0)
      expect(result.calls).toEqual([["run", "validate:push"]])
    },
  )

  it("checks source renamed into documentation", () => {
    const repo = createRepository()
    repo.write("src/example.ts")
    const base = repo.commit()
    repo.git("mv", "src/example.ts", "README.example.md")
    const head = repo.commit()
    const result = repo.run("run-push-check-if-needed.mjs", update(head, base))
    expect(result.status).toBe(0)
    expect(result.calls).toEqual([["run", "validate:push"]])
  })

  it.each(["new-ref", "missing-base", "missing-input", "malformed-input"])(
    "runs the full gate for %s",
    (scenario) => {
      const repo = createRepository()
      const input =
        scenario === "new-ref"
          ? update(repo.base, zeroSha)
          : scenario === "missing-base"
            ? update(repo.base, "1".repeat(40))
            : scenario === "malformed-input"
              ? "unexpected\n"
              : ""
      const result = repo.run("run-push-check-if-needed.mjs", input)
      expect(result.status).toBe(0)
      expect(result.calls).toEqual([["run", "validate:push"]])
    },
  )

  it("skips deletion-only pushes", () => {
    const repo = createRepository()
    const result = repo.run(
      "run-push-check-if-needed.mjs",
      update(zeroSha, repo.base),
    )
    expect(result.status).toBe(0)
    expect(result.calls).toEqual([])
  })

  it("propagates a failed full gate", () => {
    const repo = createRepository()
    const result = repo.run("run-push-check-if-needed.mjs", "", 1)
    expect(result.status).not.toBe(0)
    expect(result.calls).toEqual([["run", "validate:push"]])
  })
})
