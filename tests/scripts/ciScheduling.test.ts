import { existsSync, readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { describe, expect, it } from "vitest"

// Every workflow that spends a runner on a pull request must honour the release gate:
// release-please touches package.json, which is an input to all of them.
const workflows = [
  "test.yml",
  "quality.yml",
  "e2e-smoke.yml",
  "permission-warnings.yml",
]

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
    .split("      - name: Test CI report and release guards")[1]
    ?.split("      - name:")[0]
  const guard = step?.match(/^ {8}if: (.+)$/m)?.[1]?.trim()
  expect(guard).toBeDefined()
  expect(step).toContain("node --test tests/scripts/release-pr-check.test.mjs")
  expect(step).toContain("tests/scripts/check-unit-test-reports.test.mjs")
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
  const ordinaryJob = {
    "test.yml": "unit-tests",
    "quality.yml": "quality",
    "e2e-smoke.yml": "e2e-build",
    "permission-warnings.yml": "build",
  }[file] as string

  it.each(["push", "workflow_dispatch", "pull_request"])(
    "starts ordinary %s checks without a release runner",
    (eventName) => {
      const context = { github: github(eventName), needs: needs("skipped") }
      expect(shouldRun(file, "release-changes", context)).toBe(false)
      expect(shouldRun(file, ordinaryJob, context, false)).toBe(true)
      if (file === "test.yml")
        expect(shouldRun(file, "unit-tests-merge", context, false)).toBe(true)
    },
  )

  it("cancels ordinary checks even when release detection is skipped", () => {
    expect(
      shouldRun(
        file,
        ordinaryJob,
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
      expect(shouldRun(file, ordinaryJob, context, result === "success")).toBe(
        expected,
      )
      if (file === "test.yml")
        expect(
          shouldRun(file, "unit-tests-merge", context, result === "success"),
        ).toBe(expected)
    },
  )
})

it("builds PR previews only when a maintainer asks for one", () => {
  const source = readFileSync(".github/workflows/pr-build.yml", "utf8")
  // Per-push previews spent a runner slot that queued real checks, while merged
  // code is already packaged by the nightly release.
  expect(source).not.toMatch(/^ {2}pull_request(?:_target)?:/m)
  expect(source).not.toMatch(/^ {2}push:/m)
  expect(source).toContain("workflow_dispatch:")
  expect(source).toContain("ref: ${{ steps.pr_details.outputs.sha }}")
  expect(source).toContain("core.setOutput('sha', pr.merge_commit_sha)")
  expect(source).toContain("persist-credentials: false")
  // Comment publishing cannot rely on the fork-unsafe workflow_run path anymore.
  expect(existsSync(".github/workflows/pr-build-comment.yml")).toBe(false)
})

it("leaves setup and artifact headroom beyond both shard-two test deadlines", () => {
  const source = readFileSync(".github/workflows/e2e-smoke.yml", "utf8")
  const job = source
    .split(/^ {2}e2e-smoke:\r?$/m)[1]
    ?.split(/^ {2}[\w-]+:\r?$/m)[0]
  const timeout = Number(job?.match(/^ {4}timeout-minutes: (\d+)/m)?.[1])
  expect(timeout).toBeGreaterThanOrEqual(25)
  const smoke = job?.split("- name: Run E2E smoke")[1]?.split("- name:")[0]
  const performance = job
    ?.split("- name: Run isolated performance E2E")[1]
    ?.split("- name:")[0]
  const smokeDeadline = Number(smoke?.match(/&& (\d+) \|\|/)?.[1])
  const performanceDeadline = Number(
    performance?.match(/timeout-minutes: (\d+)/)?.[1],
  )
  expect(timeout).toBeGreaterThan(smokeDeadline + performanceDeadline)
})

it("waits for a computed merge SHA and rejects conflicts or exhausted lookups", async () => {
  const source = readFileSync(".github/workflows/pr-build.yml", "utf8").replace(
    /\r/g,
    "",
  )
  const step = source
    .split("      - name: Get PR details")[1]
    ?.split("      - name:")[0]
  const script = step
    ?.split("          script: |\n")[1]
    ?.split("\n")
    .map((line) => line.slice(12))
    .join("\n")
    .replace("${{ inputs.pr_number }}", "1817")
  if (!script) throw new Error("Missing PR lookup script")
  async function lookup(
    states: Array<{
      merge_commit_sha: string | null
      mergeable: boolean | null
      errorStatus?: number
    }>,
  ) {
    const outputs: Record<string, unknown> = {}
    let calls = 0
    const result = runInNewContext(`(async () => { ${script} })()`, {
      github: {
        rest: {
          pulls: {
            get: async () => {
              const state = states[Math.min(calls++, states.length - 1)]
              if (state?.errorStatus)
                throw Object.assign(new Error("lookup failed"), {
                  status: state.errorStatus,
                })
              return {
                data: {
                  ...state,
                  head: { ref: "feature" },
                  number: 1817,
                },
              }
            },
          },
        },
      },
      context: { repo: { owner: "example", repo: "project" } },
      core: {
        setOutput: (key: string, value: unknown) => {
          outputs[key] = value
        },
      },
      setTimeout: (callback: () => void) => callback(),
    })
    await result
    return { calls, outputs }
  }
  expect(
    await lookup([
      { merge_commit_sha: null, mergeable: null },
      { merge_commit_sha: "merged-sha", mergeable: true },
    ]),
  ).toEqual({
    calls: 2,
    outputs: { ref: "feature", sha: "merged-sha", number: 1817 },
  })
  expect(
    await lookup([
      { merge_commit_sha: null, mergeable: null, errorStatus: 503 },
      ...Array.from({ length: 4 }, () => ({
        merge_commit_sha: null,
        mergeable: null,
      })),
      { merge_commit_sha: "merged-sha", mergeable: true },
    ]),
  ).toEqual({
    calls: 6,
    outputs: { ref: "feature", sha: "merged-sha", number: 1817 },
  })
  await expect(
    lookup([
      { merge_commit_sha: null, mergeable: null, errorStatus: 403 },
      { merge_commit_sha: "merged-sha", mergeable: true },
    ]),
  ).rejects.toThrow("lookup failed")
  await expect(
    lookup([{ merge_commit_sha: null, mergeable: null, errorStatus: 503 }]),
  ).rejects.toThrow("lookup failed")
  await expect(
    lookup([{ merge_commit_sha: "stale-sha", mergeable: false }]),
  ).rejects.toThrow()
  await expect(
    lookup([{ merge_commit_sha: null, mergeable: null }]),
  ).rejects.toThrow()
})

it("still checks permission warnings on every ordinary pull request", () => {
  const source = readFileSync(
    ".github/workflows/permission-warnings.yml",
    "utf8",
  )
  // The release gate must not become a general escape hatch: manifest changes always
  // need the native warning comparison, so no label or optional-build bypass exists.
  expect(source).not.toMatch(/labels\.\*\.name/u)
  expect(source).not.toContain("e2e-optional")
  // The warning job consumes the build's artifact, so a gated-off build must take it
  // down too rather than letting it run against a missing artifact. That holds only
  // while the job keeps GitHub's implicit success() condition over `needs`.
  const warnings = source.split(/^ {2}warnings:/m)[1]?.split(/^ {2}[\w-]+:/m)[0]
  expect(warnings).toBeDefined()
  expect(warnings).toContain("needs: build")
  expect(warnings).not.toMatch(/^ {4}if:/m)
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
