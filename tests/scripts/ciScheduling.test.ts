import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { describe, expect, it } from "vitest"

const workflows = ["test.yml", "quality.yml", "e2e-smoke.yml", "pr-build.yml"]

it.each([
  {
    outcome: "failed",
    failed: true,
    screenshots: false,
    cancelled: false,
    upload: true,
  },
  {
    outcome: "retry passed",
    failed: false,
    screenshots: true,
    cancelled: false,
    upload: true,
  },
  {
    outcome: "passed cleanly",
    failed: false,
    screenshots: false,
    cancelled: false,
    upload: false,
  },
  {
    outcome: "cancelled",
    failed: false,
    screenshots: true,
    cancelled: true,
    upload: false,
  },
])(
  "preserves smoke failure artifacts when the run $outcome",
  ({ failed, screenshots, cancelled, upload }) => {
    const workflow = readFileSync(".github/workflows/e2e-smoke.yml", "utf8")
    const step = workflow
      .split("      - name: Upload Playwright artifacts (failure)")[1]
      ?.split("      - name:")[0]
    const guard = step
      ?.match(/^ {8}if: (.+)$/m)?.[1]
      ?.trim()
      .replace(/^\$\{\{\s*|\s*\}\}$/g, "")
    expect(guard).toBeDefined()
    expect(
      runInNewContext(guard ?? "false", {
        failure: () => failed,
        cancelled: () => cancelled,
        hashFiles: (pattern: string) =>
          pattern === "test-results/**/test-failed-*.png" && screenshots
            ? "failure-screenshot-hash"
            : "",
      }),
    ).toBe(upload)
  },
)

it("runs smoke performance cases once in isolation, including after functional failures", () => {
  const workflow = readFileSync(".github/workflows/e2e-smoke.yml", "utf8")
  const functional = workflow
    .split("      - name: Run E2E smoke")[1]
    ?.split("      - name:")[0]
  expect(functional).toContain('--grep-invert="major pages with"')
  const performance = workflow
    .split("      - name: Run isolated performance E2E")[1]
    ?.split("      - name:")[0]
  expect(performance).toBeDefined()
  expect(performance).toContain('AAH_E2E_WORKERS: "1"')
  expect(performance).toContain("e2e/multiAccountPerformance.spec.ts")
  expect(performance).not.toContain("--shard=")
  expect(performance).toContain("--output=test-results/performance")
  expect(performance).toContain(
    "PLAYWRIGHT_HTML_OUTPUT_DIR: playwright-report/performance",
  )
  const guard = performance
    ?.match(/^ {8}if: (.+)$/m)?.[1]
    ?.trim()
    .replace(/^\$\{\{\s*|\s*\}\}$/g, "")
  // An explicit status function also schedules this step after a failed test step.
  expect(guard).toContain("!cancelled()")
  for (const e2e_type of ["default", "dnr-required", "bookmarks-required"]) {
    for (let shard = 1; shard <= 6; shard++) {
      for (const cancelled of [false, true]) {
        expect(
          runInNewContext(guard ?? "false", {
            matrix: { e2e_type, shard },
            cancelled: () => cancelled,
          }),
        ).toBe(!cancelled && e2e_type === "default" && shard === 2)
      }
    }
  }
})

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

describe("smoke tests after an ordinary skipped release ancestor", () => {
  it.each(["push", "workflow_dispatch", "pull_request"])(
    "runs on %s when the reusable builds succeeded",
    (eventName) => {
      expect(
        shouldRun(
          "e2e-smoke.yml",
          "e2e-smoke",
          {
            github: github(eventName),
            needs: { "e2e-build": { result: "success" } },
          },
          false,
        ),
      ).toBe(true)
    },
  )

  it.each(["failure", "skipped", "cancelled"])(
    "does not download absent artifacts after %s builds",
    (result) => {
      expect(
        shouldRun(
          "e2e-smoke.yml",
          "e2e-smoke",
          {
            github: github("pull_request"),
            needs: { "e2e-build": { result } },
          },
          false,
        ),
      ).toBe(false)
    },
  )

  it("still honors cancellation and skip-e2e", () => {
    for (const overrides of [
      { cancelled: () => true },
      { labels: ["skip-e2e"] },
    ]) {
      expect(
        shouldRun(
          "e2e-smoke.yml",
          "e2e-smoke",
          {
            github: github("pull_request"),
            needs: { "e2e-build": { result: "success" } },
            ...overrides,
          },
          false,
        ),
      ).toBe(false)
    }
  })
})

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
