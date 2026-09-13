import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

import { isReleaseOnly } from "../../scripts/release-pr-check.mjs"

test("unreadable event data retains normal checks and produces a usable output", () => {
  const directory = mkdtempSync(join(tmpdir(), "release-pr-check-"))
  try {
    const output = join(directory, "output")
    const summary = join(directory, "summary")
    execFileSync(
      process.execPath,
      [
        fileURLToPath(
          new URL("../../scripts/release-pr-check.mjs", import.meta.url),
        ),
      ],
      {
        env: {
          ...process.env,
          GITHUB_EVENT_PATH: join(directory, "missing-event.json"),
          GITHUB_OUTPUT: output,
          GITHUB_STEP_SUMMARY: summary,
        },
        stdio: "pipe",
      },
    )
    assert.equal(readFileSync(output, "utf8"), "release-only=false\n")
    assert.match(readFileSync(summary, "utf8"), /Running normal checks/)
  } finally {
    assert.equal(
      directory.startsWith(join(tmpdir(), "release-pr-check-")),
      true,
    )
    rmSync(directory, { recursive: true, force: true })
  }
})

const repository = "example/project"
const packageBefore = {
  name: "example",
  version: "1.0.0",
  scripts: { test: "vitest" },
  dependencies: { example: "1.0.0" },
}

/** Creates a release PR event and overridable Git responses for guard tests. */
function input(overrides = {}) {
  return {
    eventName: "pull_request",
    repository,
    pullRequest: {
      head: {
        ref: "release-please--branches--main--components--example",
        repo: { full_name: repository },
        sha: "head",
      },
      base: { sha: "base" },
    },
    git: (args) => {
      if (args[0] === "merge-base") return "merge-base\n"
      if (args[0] === "diff") return "M\0CHANGELOG.md\0M\0package.json\0"
      return JSON.stringify({
        ...packageBefore,
        version: args[1] === "head:package.json" ? "1.1.0" : "1.0.0",
      })
    },
    ...overrides,
  }
}

test("exempts a release PR with only a version bump and changelog", () => {
  assert.equal(isReleaseOnly(input()), true)
})

for (const eventName of ["push", "workflow_dispatch", "merge_group"]) {
  test(`${eventName} retains normal checks without reading a diff`, () => {
    assert.equal(
      isReleaseOnly(
        input({ eventName, git: () => assert.fail("unexpected git") }),
      ),
      false,
    )
  })
}

test("forks and ordinary branches cannot claim the release exemption", () => {
  for (const head of [
    { ...input().pullRequest.head, repo: { full_name: "fork/project" } },
    { ...input().pullRequest.head, ref: "feature/release" },
  ]) {
    assert.equal(
      isReleaseOnly(input({ pullRequest: { ...input().pullRequest, head } })),
      false,
    )
  }
})

for (const changes of [
  "",
  "M\0CHANGELOG.md\0",
  "M\0package.json\0M\0src/app.ts\0",
  "M\0package.json\0M\0pnpm-lock.yaml\0",
  "D\0CHANGELOG.md\0M\0package.json\0",
  "R100\0old.md\0CHANGELOG.md\0M\0package.json\0",
  "T\0package.json\0",
]) {
  test(`retains checks for unexpected diff ${JSON.stringify(changes)}`, () => {
    const original = input()
    assert.equal(
      isReleaseOnly(
        input({
          git: (args) => (args[0] === "diff" ? changes : original.git(args)),
        }),
      ),
      false,
    )
  })
}

for (const update of [
  { version: "1.0.0" },
  { version: "invalid" },
  { version: 123 },
  { scripts: { test: "echo skipped" } },
  { dependencies: { example: "2.0.0" } },
  { private: true },
]) {
  test(`retains checks for package change ${JSON.stringify(update)}`, () => {
    const original = input()
    assert.equal(
      isReleaseOnly(
        input({
          git: (args) =>
            args[0] === "show" && args[1] === "head:package.json"
              ? JSON.stringify({
                  ...packageBefore,
                  version: "1.1.0",
                  ...update,
                })
              : original.git(args),
        }),
      ),
      false,
    )
  })
}

test("uses the actual merge base when main advances, and detects real source edits", () => {
  const directory = mkdtempSync(join(tmpdir(), "release-pr-check-"))
  const git = (args) =>
    execFileSync("git", args, {
      cwd: directory,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
  const commit = (message) => {
    git(["add", "."])
    git([
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-m",
      message,
    ])
    return git(["rev-parse", "HEAD"]).trim()
  }
  try {
    git(["init"])
    writeFileSync(
      join(directory, "package.json"),
      JSON.stringify(packageBefore),
    )
    writeFileSync(join(directory, "CHANGELOG.md"), "Initial release\n")
    const ancestor = commit("initial")
    writeFileSync(
      join(directory, "package.json"),
      JSON.stringify({ ...packageBefore, version: "1.1.0" }),
    )
    writeFileSync(join(directory, "CHANGELOG.md"), "New release\n")
    const head = commit("release")
    git(["checkout", "--detach", ancestor])
    writeFileSync(
      join(directory, "package.json"),
      JSON.stringify({ ...packageBefore, private: true }),
    )
    const base = commit("main advances")
    const options = input({ git })
    options.pullRequest.head.sha = head
    options.pullRequest.base.sha = base
    assert.equal(isReleaseOnly(options), true)
    git(["checkout", "--detach", head])
    writeFileSync(join(directory, "app.js"), "console.log('changed')\n")
    options.pullRequest.head.sha = commit("source change")
    assert.equal(isReleaseOnly(options), false)
  } finally {
    // mkdtempSync created this exact task-owned directory under the OS temp dir.
    assert.equal(
      directory.startsWith(join(tmpdir(), "release-pr-check-")),
      true,
    )
    rmSync(directory, { recursive: true, force: true })
  }
})
