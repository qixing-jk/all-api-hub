import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { describe, expect, it } from "vitest"

const workflows = ["test.yml", "quality.yml", "e2e-smoke.yml", "pr-build.yml"]

it("runs release-diff regression checks once when ordinary preflight jobs are skipped", () => {
  const workflow = readFileSync(".github/workflows/test.yml", "utf8")
  const step = workflow
    .split("      - name: Test release change detection")[1]
    ?.split("      - name:")[0]
  const guard = step?.match(/^ {8}if: (.+)$/m)?.[1]?.trim()
  expect(guard).toBeDefined()
  expect(step).toContain("node --test tests/scripts/release-pr-check.test.mjs")
  for (let shard = 1; shard <= 6; shard++) {
    expect(runInNewContext(guard ?? "true", { matrix: { shard } })).toBe(
      shard === 1,
    )
  }
})

it("only generates shard timings on runs that publish the cache", () => {
  const workflow = readFileSync(".github/workflows/test.yml", "utf8")
  const step = workflow
    .split("      - name: Generate unit test durations")[1]
    ?.split("      - name:")[0]
  const guard = step?.match(/^ {8}if: (.+)$/m)?.[1]?.trim()
  expect(guard).toBeDefined()
  for (const eventName of ["pull_request", "push", "workflow_dispatch"]) {
    expect(
      runInNewContext(guard ?? "true", { github: github(eventName) }),
    ).toBe(eventName !== "pull_request")
  }
})

/** Evaluate the workflow's actual job guard, including Actions' implicit success check. */
function shouldRun(
  file: string,
  job: string,
  context: Record<string, unknown>,
  upstreamSucceeded = true,
) {
  const workflow = readFileSync(`.github/workflows/${file}`, "utf8")
  const body = workflow
    .split(new RegExp(`^  ${job}:\\r?$`, "m"))[1]
    ?.split(/^ {2}[\w-]+:\r?$/m)[0]
  if (!body) throw new Error(`Missing job ${job} in ${file}`)
  const guard = body?.match(/^ {4}if: (.+)$/m)?.[1]?.trim()
  if (!guard) return upstreamSucceeded
  const expression = guard
    .replace(/^\$\{\{\s*|\s*\}\}$/g, "")
    .replace(/\.([\w]+-[\w-]+)/g, '["$1"]')
    .replace(/github\.event\.pull_request\.labels\.\*\.name/g, "labels")
  const hasStatusCheck = /\b(always|cancelled|failure|success)\(/.test(
    expression,
  )
  return (
    (hasStatusCheck || upstreamSucceeded) &&
    Boolean(
      runInNewContext(expression, {
        cancelled: () => false,
        contains: (values: string[], value: string) => values.includes(value),
        startsWith: (value: string, prefix: string) => value.startsWith(prefix),
        labels: [],
        ...context,
      }),
    )
  )
}

function github(
  eventName: string,
  ref = "feature/example",
  repository = "example/project",
) {
  return {
    event_name: eventName,
    repository: "example/project",
    event:
      eventName === "pull_request"
        ? { pull_request: { head: { ref, repo: { full_name: repository } } } }
        : {},
  }
}

function needs(result: string, releaseOnly = "") {
  return {
    "release-changes": { result, outputs: { "release-only": releaseOnly } },
    "unit-tests": { result: "success" },
  }
}

describe.each(workflows)("CI scheduling: %s", (file) => {
  it.each(["push", "workflow_dispatch", "pull_request"])(
    "starts ordinary %s checks without a release runner",
    (eventName) => {
      const context = { github: github(eventName), needs: needs("skipped") }
      expect(shouldRun(file, "release-changes", context)).toBe(false)
      const job =
        file === "test.yml"
          ? "unit-tests"
          : file === "quality.yml"
            ? "quality"
            : file === "e2e-smoke.yml"
              ? "e2e-build"
              : "build-artifact"
      expect(shouldRun(file, job, context, false)).toBe(true)
      if (file === "test.yml")
        expect(shouldRun(file, "unit-tests-merge", context, false)).toBe(true)
    },
  )

  it("cancels ordinary checks even when release detection is skipped", () => {
    const job =
      file === "test.yml"
        ? "unit-tests"
        : file === "quality.yml"
          ? "quality"
          : file === "e2e-smoke.yml"
            ? "e2e-build"
            : "build-artifact"
    expect(
      shouldRun(
        file,
        job,
        {
          github: github("push"),
          needs: needs("skipped"),
          cancelled: () => true,
        },
        false,
      ),
    ).toBe(false)
  })

  it("checks candidate release diffs and rejects fork claims", () => {
    expect(
      shouldRun(file, "release-changes", {
        github: github("pull_request", "release-please--branches--main"),
      }),
    ).toBe(true)
    expect(
      shouldRun(file, "release-changes", {
        github: github(
          "pull_request",
          "release-please--branches--main",
          "fork/project",
        ),
      }),
    ).toBe(false)
  })

  it.each([
    ["success", "true", false],
    ["success", "false", true],
    ["failure", "", false],
    ["cancelled", "", false],
  ])(
    "preserves the release gate for %s (%s)",
    (result, releaseOnly, expected) => {
      const context = {
        github: github("pull_request", "release-please--branches--main"),
        needs: needs(result, releaseOnly),
        cancelled: () => result === "cancelled",
      }
      const job =
        file === "test.yml"
          ? "unit-tests"
          : file === "quality.yml"
            ? "quality"
            : file === "e2e-smoke.yml"
              ? "e2e-build"
              : "build-artifact"
      expect(shouldRun(file, job, context, result === "success")).toBe(expected)
      if (file === "test.yml")
        expect(
          shouldRun(file, "unit-tests-merge", context, result === "success"),
        ).toBe(expected)
    },
  )
})

it("merges reports from failed shards but never from skipped or cancelled shards", () => {
  for (const result of ["success", "failure", "skipped", "cancelled"]) {
    expect(
      shouldRun(
        "test.yml",
        "unit-tests-merge",
        {
          github: github("push"),
          needs: { ...needs("skipped"), "unit-tests": { result } },
        },
        false,
      ),
    ).toBe(result === "success" || result === "failure")
  }
})

it("preserves the skip-e2e label", () => {
  expect(
    shouldRun(
      "e2e-smoke.yml",
      "e2e-build",
      {
        github: github("pull_request"),
        needs: needs("skipped"),
        labels: ["skip-e2e"],
      },
      false,
    ),
  ).toBe(false)
})
